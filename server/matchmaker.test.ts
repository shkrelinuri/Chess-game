import assert from "node:assert/strict";
import test from "node:test";
import { Matchmaker } from "./matchmaker";

test("matchmaking only pairs players on the same time control", () => {
  const matchmaker = new Matchmaker();

  assert.equal(matchmaker.join("player-a", "blitz-3-2"), null);
  assert.equal(matchmaker.join("player-b", "rapid-10-0"), null);
  assert.deepEqual(matchmaker.join("player-c", "blitz-3-2"), {
    first: "player-a",
    second: "player-c",
    timeControl: "blitz-3-2",
  });
  assert.deepEqual(matchmaker.join("player-d", "rapid-10-0"), {
    first: "player-b",
    second: "player-d",
    timeControl: "rapid-10-0",
  });
});

test("cancelling removes a player from matchmaking", () => {
  const matchmaker = new Matchmaker();

  matchmaker.join("player-a", "bullet-1-0");
  assert.equal(matchmaker.leave("player-a"), true);
  assert.equal(matchmaker.leave("player-a"), false);
  assert.equal(matchmaker.join("player-b", "bullet-1-0"), null);
  assert.deepEqual(matchmaker.join("player-c", "bullet-1-0"), {
    first: "player-b",
    second: "player-c",
    timeControl: "bullet-1-0",
  });
});

test("joining a new queue replaces the player's previous wait", () => {
  const matchmaker = new Matchmaker();

  matchmaker.join("player-a", "blitz-3-2");
  assert.equal(matchmaker.join("player-a", "blitz-5-0"), null);
  assert.equal(matchmaker.join("player-b", "blitz-3-2"), null);
  assert.deepEqual(matchmaker.join("player-c", "blitz-5-0"), {
    first: "player-a",
    second: "player-c",
    timeControl: "blitz-5-0",
  });
});