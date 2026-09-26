import { Chess, type Square } from "chess.js";
import type { BoardSnapshot, ChessRules, PlayerMove, Side } from "./game-session";

export type ChessBoard = Chess;

export const chessRules: ChessRules<ChessBoard> = {
  create: () => new Chess(),
  snapshot: (board) => snapshot(board),
  applyMove: (board, move) => {
    try {
      const applied = board.move({
        from: move.from as Square,
        to: move.to as Square,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
      return { board, snapshot: snapshot(board), san: applied.san };
    } catch {
      return null;
    }
  },
};

function snapshot(board: Chess): BoardSnapshot {
  const turn: Side = board.turn() === "w" ? "white" : "black";
  const result = board.isCheckmate()
    ? { type: "checkmate" as const, winner: turn === "white" ? "black" as const : "white" as const }
    : board.isStalemate()
      ? { type: "stalemate" as const, winner: null }
      : board.isDraw()
        ? { type: "draw" as const, winner: null }
        : null;

  return {
    fen: board.fen(),
    turn,
    sanMoves: board.history(),
    inCheck: board.isCheck(),
    result,
  };
}

export function applyRulesMove(board: Chess, move: PlayerMove) {
  return chessRules.applyMove(board, move);
}