import type { GameView, PlayerMove, TimeControl } from "../../server/game-session";

export type ClientToServerEvents = {
  "queue:join": (timeControl: TimeControl) => void;
  "queue:cancel": () => void;
  "game:move": (move: PlayerMove) => void;
  "game:resign": () => void;
  "game:draw-offer": () => void;
  "game:draw-response": (accept: boolean) => void;
};

export type ServerToClientEvents = {
  "queue:status": (status: "searching" | "cancelled") => void;
  "game:started": (payload: { game: GameView; playerId: string }) => void;
  "game:state": (game: GameView) => void;
  "game:error": (message: string) => void;
};