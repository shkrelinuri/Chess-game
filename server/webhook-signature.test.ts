import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyRevenueCatWebhookSignature } from "./http-api";

test("RevenueCat webhook HMAC is timing-safe checked against raw bytes and timestamp", () => {
  const priorSecret = process.env.REVENUECAT_WEBHOOK_HMAC_SECRET;
  const secret = "test-webhook-secret";
  process.env.REVENUECAT_WEBHOOK_HMAC_SECRET = secret;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = Buffer.from('{"event":{"id":"test-event"}}');
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");

  try {
    assert.equal(verifyRevenueCatWebhookSignature(body, `t=${timestamp},v1=${digest}`), true);
    assert.equal(verifyRevenueCatWebhookSignature(Buffer.from(`${body.toString()} `), `t=${timestamp},v1=${digest}`), false);
    assert.equal(verifyRevenueCatWebhookSignature(body, `t=1,v1=${digest}`), false);
  } finally {
    if (priorSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_HMAC_SECRET;
    else process.env.REVENUECAT_WEBHOOK_HMAC_SECRET = priorSecret;
  }
});