import assert from "node:assert/strict";
import test from "node:test";
import { chessRules } from "./chess-rules";
import { GameSessionManager } from "./game-session";

test("server rejects moves from the wrong player and illegal moves", () => {
  let now = 1_000;
  const manager = new GameSessionManager(chessRules, () => now);
  const game = manager.createGame("white-player", "black-player", "blitz-3-2");

  assert.throws(() => manager.playMove(game.id, "black-player", { from: "e7", to: "e5" }), /not your turn/);
  assert.throws(() => manager.playMove(game.id, "white-player", { from: "e2", to: "e5" }), /Illegal move/);
  now += 1_000;
  const accepted = manager.playMove(game.id, "white-player", { from: "e2", to: "e4" });

  assert.deepEqual(accepted.sanMoves, ["e4"]);
  assert.equal(accepted.turn, "black");
  assert.equal(accepted.clocks.white, 181_000);
});

test("authoritative clock expires the active side and ends the game", () => {
  let now = 10_000;
  const manager = new GameSessionManager(chessRules, () => now);
  const game = manager.createGame("white-player", "black-player", "bullet-1-0");

  now += 60_001;
  const expired = manager.getView(game.id);

  assert.equal(expired?.status, "finished");
  assert.deepEqual(expired?.result, { type: "timeout", winner: "black" });
  assert.equal(expired?.clocks.white, 0);
});

test("draw offers require the opponent to accept", () => {
  const manager = new GameSessionManager(chessRules);
  const game = manager.createGame("white-player", "black-player", "rapid-10-0");

  assert.equal(manager.offerDraw(game.id, "white-player").drawOfferBy, "white-player");
  assert.throws(() => manager.respondToDraw(game.id, "white-player", true), /no draw offer/);
  assert.equal(manager.respondToDraw(game.id, "black-player", true).result?.type, "agreement");
});