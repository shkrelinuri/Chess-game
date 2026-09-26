import assert from "node:assert/strict";
import test from "node:test";
import { hasPremiumEntitlement, PREMIUM_ENTITLEMENT_ID } from "../src/lib/subscriptions/entitlements";
import { FREE_USAGE_LIMITS, isLimitedFeature, localDayKey } from "../src/lib/subscriptions/limits";

test("the single entitlement predicate handles active, expired, and grace access", () => {
  const now = Date.parse("2026-09-26T12:00:00.000Z");

  assert.equal(hasPremiumEntitlement({ premium: { isActive: true } }, now), true);
  assert.equal(hasPremiumEntitlement({ premium: { isActive: false, grace_period_expires_date: "2026-09-27T00:00:00Z" } }, now), true);
  assert.equal(hasPremiumEntitlement({ premium: { expires_date: "2026-09-26T11:59:00Z", grace_period_expires_date: "2026-09-27T00:00:00Z" } }, now), true);
  assert.equal(hasPremiumEntitlement({ premium: { expires_date: "2026-09-26T11:59:00Z" } }, now), false);
  assert.equal(hasPremiumEntitlement({ [`${PREMIUM_ENTITLEMENT_ID}-monthly`]: { isActive: true } }, now), false);
});

test("free caps live in one config and local day keys follow the supplied timezone", () => {
  assert.equal(FREE_USAGE_LIMITS.analysis.dailyLimit, 3);
  assert.equal(FREE_USAGE_LIMITS.puzzle.dailyLimit, 10);
  assert.equal(FREE_USAGE_LIMITS.puzzleRush.dailyLimit, 1);
  assert.equal(isLimitedFeature("puzzleRush"), true);
  assert.equal(isLimitedFeature("openingStats"), false);
  assert.equal(localDayKey(new Date("2026-09-27T02:00:00Z"), "America/Los_Angeles"), "2026-09-26");
  assert.equal(localDayKey(new Date("2026-09-27T02:00:00Z"), "Pacific/Auckland"), "2026-09-27");
});