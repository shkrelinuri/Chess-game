export type Side = "white" | "black";
export type TimeControl = "bullet-1-0" | "blitz-3-2" | "blitz-5-0" | "rapid-10-0" | "rapid-15-10" | "classical-30-0";
export type PlayerMove = { from: string; to: string; promotion?: string };
export type GameResult = {
  type: "checkmate" | "draw" | "stalemate" | "timeout" | "resignation" | "agreement";
  winner: Side | null;
};

export type BoardSnapshot = {
  fen: string;
  turn: Side;
  sanMoves: string[];
  inCheck: boolean;
  result: { type: "checkmate" | "draw" | "stalemate"; winner: Side | null } | null;
};

export type ChessRules<Board> = {
  create(): Board;
  snapshot(board: Board): BoardSnapshot;
  applyMove(board: Board, move: PlayerMove): { board: Board; snapshot: BoardSnapshot; san: string } | null;
};

export type GameView = {
  id: string;
  status: "active" | "finished";
  timeControl: TimeControl;
  players: { white: string; black: string };
  fen: string;
  turn: Side;
  sanMoves: string[];
  inCheck: boolean;
  clocks: Record<Side, number>;
  result: GameResult | null;
  drawOfferBy: string | null;
  serverTime: number;
};

type Session<Board> = {
  id: string;
  timeControl: TimeControl;
  players: Record<Side, string>;
  board: Board;
  status: GameView["status"];
  remaining: Record<Side, number>;
  runningSince: number | null;
  result: GameResult | null;
  drawOfferBy: string | null;
};

const controls: Record<TimeControl, { initialMs: number; incrementMs: number }> = {
  "bullet-1-0": { initialMs: 60_000, incrementMs: 0 },
  "blitz-3-2": { initialMs: 180_000, incrementMs: 2_000 },
  "blitz-5-0": { initialMs: 300_000, incrementMs: 0 },
  "rapid-10-0": { initialMs: 600_000, incrementMs: 0 },
  "rapid-15-10": { initialMs: 900_000, incrementMs: 10_000 },
  "classical-30-0": { initialMs: 1_800_000, incrementMs: 0 },
};

export const TIME_CONTROLS = Object.keys(controls) as TimeControl[];

export class GameSessionManager<Board> {
  private readonly sessions = new Map<string, Session<Board>>();
  private nextId = 1;

  constructor(
    private readonly rules: ChessRules<Board>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  createGame(whitePlayer: string, blackPlayer: string, timeControl: TimeControl): GameView {
    if (whitePlayer === blackPlayer) throw new Error("A game requires two different players");
    const clock = controls[timeControl];
    if (!clock) throw new Error("Unsupported time control");

    const board = this.rules.create();
    const now = this.now();
    const session: Session<Board> = {
      id: `game-${this.nextId++}`,
      timeControl,
      players: { white: whitePlayer, black: blackPlayer },
      board,
      status: "active",
      remaining: { white: clock.initialMs, black: clock.initialMs },
      runningSince: now,
      result: null,
      drawOfferBy: null,
    };
    this.sessions.set(session.id, session);
    return this.toView(session, now);
  }

  getView(gameId: string): GameView | null {
    const session = this.sessions.get(gameId);
    if (!session) return null;
    const now = this.now();
    this.settleClock(session, now);
    return this.toView(session, now);
  }

  playMove(gameId: string, playerId: string, move: PlayerMove): GameView {
    const session = this.requireActive(gameId);
    const now = this.now();
    this.settleClock(session, now);
    if (session.status !== "active") throw new Error("The game has ended");

    const snapshot = this.rules.snapshot(session.board);
    if (session.players[snapshot.turn] !== playerId) throw new Error("It is not your turn");
    const applied = this.rules.applyMove(session.board, move);
    if (!applied) throw new Error("Illegal move");

    session.board = applied.board;
    session.drawOfferBy = null;
    const increment = controls[session.timeControl].incrementMs;
    session.remaining[snapshot.turn] += increment;
    if (applied.snapshot.result) {
      session.status = "finished";
      session.result = applied.snapshot.result;
      session.runningSince = null;
    } else {
      session.runningSince = now;
    }
    return this.toView(session, now);
  }

  resign(gameId: string, playerId: string): GameView {
    const session = this.requireActive(gameId);
    const side = this.sideFor(session, playerId);
    const now = this.now();
    this.settleClock(session, now);
    if (session.status === "active") this.finish(session, { type: "resignation", winner: opposite(side) });
    return this.toView(session, now);
  }

  offerDraw(gameId: string, playerId: string): GameView {
    const session = this.requireActive(gameId);
    this.sideFor(session, playerId);
    const now = this.now();
    this.settleClock(session, now);
    if (session.status !== "active") throw new Error("The game has ended");
    session.drawOfferBy = playerId;
    return this.toView(session, now);
  }

  respondToDraw(gameId: string, playerId: string, accept: boolean): GameView {
    const session = this.requireActive(gameId);
    this.sideFor(session, playerId);
    const now = this.now();
    this.settleClock(session, now);
    if (!session.drawOfferBy || session.drawOfferBy === playerId) throw new Error("There is no draw offer to respond to");
    if (accept && session.status === "active") this.finish(session, { type: "agreement", winner: null });
    session.drawOfferBy = null;
    return this.toView(session, now);
  }

  private requireActive(gameId: string): Session<Board> {
    const session = this.sessions.get(gameId);
    if (!session) throw new Error("Game not found");
    if (session.status !== "active") throw new Error("The game has ended");
    return session;
  }

  private sideFor(session: Session<Board>, playerId: string): Side {
    if (session.players.white === playerId) return "white";
    if (session.players.black === playerId) return "black";
    throw new Error("You are not a player in this game");
  }

  private settleClock(session: Session<Board>, now: number) {
    if (session.status !== "active" || session.runningSince === null) return;
    const activeSide = this.rules.snapshot(session.board).turn;
    const elapsed = Math.max(0, now - session.runningSince);
    session.remaining[activeSide] = Math.max(0, session.remaining[activeSide] - elapsed);
    session.runningSince = now;
    if (session.remaining[activeSide] === 0) {
      this.finish(session, { type: "timeout", winner: opposite(activeSide) });
    }
  }

  private finish(session: Session<Board>, result: GameResult) {
    session.status = "finished";
    session.result = result;
    session.runningSince = null;
    session.drawOfferBy = null;
  }

  private toView(session: Session<Board>, now: number): GameView {
    const board = this.rules.snapshot(session.board);
    return {
      id: session.id,
      status: session.status,
      timeControl: session.timeControl,
      players: { ...session.players },
      fen: board.fen,
      turn: board.turn,
      sanMoves: [...board.sanMoves],
      inCheck: board.inCheck,
      clocks: { ...session.remaining },
      result: session.result,
      drawOfferBy: session.drawOfferBy,
      serverTime: now,
    };
  }
}

function opposite(side: Side): Side {
  return side === "white" ? "black" : "white";
}