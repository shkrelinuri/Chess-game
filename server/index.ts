import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../src/lib/socket-protocol";
import { chessRules } from "./chess-rules";
import {
  GameSessionManager,
  TIME_CONTROLS,
  type GameView,
  type TimeControl,
} from "./game-session";
import { Matchmaker } from "./matchmaker";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Render provides PORT automatically.
// When running locally, fall back to SOCKET_PORT or 3001.
const port = Number(
  process.env.PORT ?? process.env.SOCKET_PORT ?? 3001
);

// Allowed frontend origins.
// In Render, set WEB_ORIGINS to your Vercel URL:
// https://chess-game-three-navy.vercel.app
const allowedOrigins = (
  process.env.WEB_ORIGINS ??
  "http://localhost:3000,capacitor://localhost,http://localhost"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const httpServer = createServer();

const io = new Server<ClientToServerEvents, ServerToClientEvents>(
  httpServer,
  {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
  }
);

const sessions = new GameSessionManager(chessRules);
const matchmaker = new Matchmaker();

const socketGames = new Map<string, string>();
const finishedBroadcasts = new Set<string>();

function sendGameState(gameId: string) {
  const game = sessions.getView(gameId);

  if (game) {
    io.to(gameId).emit("game:state", game);

    if (game.status === "finished") {
      finishedBroadcasts.add(gameId);
    }
  }
}

function beginGame(
  first: GameSocket,
  second: GameSocket,
  timeControl: TimeControl
) {
  const firstIsWhite = Math.random() < 0.5;

  const white = firstIsWhite ? first : second;
  const black = firstIsWhite ? second : first;

  const game = sessions.createGame(
    white.id,
    black.id,
    timeControl
  );

  for (const player of [first, second]) {
    socketGames.set(player.id, game.id);
    player.join(game.id);

    player.emit("game:started", {
      game,
      playerId: player.id,
    });
  }

  sendGameState(game.id);
}

io.on("connection", (socket: GameSocket) => {
  socket.on("queue:join", (timeControl) => {
    if (!TIME_CONTROLS.includes(timeControl)) {
      socket.emit(
        "game:error",
        "Choose a supported time control."
      );
      return;
    }

    const existingGameId = socketGames.get(socket.id);

    if (existingGameId) {
      const existingGame = sessions.getView(existingGameId);

      if (existingGame?.status === "active") {
        socket.emit(
          "game:error",
          "Finish your current game before matchmaking again."
        );
        return;
      }

      socket.leave(existingGameId);
      socketGames.delete(socket.id);
    }

    const pairing = matchmaker.join(
      socket.id,
      timeControl
    );

    if (!pairing) {
      socket.emit("queue:status", "searching");
      return;
    }

    const opponent = io.sockets.sockets.get(
      pairing.first
    ) as GameSocket | undefined;

    if (!opponent) {
      const retryPairing = matchmaker.join(
        socket.id,
        timeControl
      );

      if (!retryPairing) {
        socket.emit("queue:status", "searching");
      }

      return;
    }

    beginGame(
      opponent,
      socket,
      timeControl
    );
  });

  socket.on("queue:cancel", () => {
    if (matchmaker.leave(socket.id)) {
      socket.emit("queue:status", "cancelled");
    }
  });

  socket.on("game:move", (move) => {
    const gameId = socketGames.get(socket.id);

    if (!gameId) {
      socket.emit(
        "game:error",
        "You are not in an active game."
      );
      return;
    }

    try {
      sessions.playMove(
        gameId,
        socket.id,
        move
      );

      sendGameState(gameId);
    } catch (error) {
      socket.emit(
        "game:error",
        error instanceof Error
          ? error.message
          : "Move rejected."
      );

      sendGameState(gameId);
    }
  });

  socket.on("game:resign", () =>
    runAction(socket, (gameId) =>
      sessions.resign(gameId, socket.id)
    )
  );

  socket.on("game:draw-offer", () =>
    runAction(socket, (gameId) =>
      sessions.offerDraw(gameId, socket.id)
    )
  );

  socket.on("game:draw-response", (accept) => {
    if (typeof accept !== "boolean") {
      socket.emit(
        "game:error",
        "Draw response must be accepted or declined."
      );
      return;
    }

    runAction(socket, (gameId) =>
      sessions.respondToDraw(
        gameId,
        socket.id,
        accept
      )
    );
  });

  socket.on("disconnect", () => {
    matchmaker.leave(socket.id);

    const gameId = socketGames.get(socket.id);

    if (!gameId) {
      return;
    }

    socketGames.delete(socket.id);

    try {
      sessions.resign(
        gameId,
        socket.id
      );

      sendGameState(gameId);
    } catch {
      // A game may already have finished
      // before the disconnect arrived.
    }
  });
});

function runAction(
  socket: GameSocket,
  action: (gameId: string) => GameView
) {
  const gameId = socketGames.get(socket.id);

  if (!gameId) {
    socket.emit(
      "game:error",
      "You are not in an active game."
    );
    return;
  }

  try {
    action(gameId);
    sendGameState(gameId);
  } catch (error) {
    socket.emit(
      "game:error",
      error instanceof Error
        ? error.message
        : "Action rejected."
    );
  }
}

// Periodically check for games that have finished
// due to time expiration.
setInterval(() => {
  for (const gameId of new Set(socketGames.values())) {
    if (finishedBroadcasts.has(gameId)) {
      continue;
    }

    const game = sessions.getView(gameId);

    if (game?.status === "finished") {
      io.to(gameId).emit(
        "game:state",
        game
      );

      finishedBroadcasts.add(gameId);
    }
  }
}, 250);

// Render requires the server to listen on the PORT
// environment variable and on 0.0.0.0.
httpServer.listen(
  port,
  "0.0.0.0",
  () => {
    console.log(
      `Socket.IO chess server listening on port ${port}`
    );
  }
);
