import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isLimitedFeature } from "../src/lib/subscriptions/limits";
import { verifyFirebaseIdToken } from "./firebase-admin";
import { getPool } from "./postgres";
import { invalidateRevenueCatSubscriber, isRevenueCatPremium } from "./revenuecat";
import { reserveDailyUsage } from "./usage-service";

type JsonRecord = Record<string, unknown>;

function sendJson(response: ServerResponse, statusCode: number, body: JsonRecord) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function setCors(response: ServerResponse) {
  const allowedOrigins = (process.env.WEB_ORIGINS ?? "http://localhost:3000,capacitor://localhost,http://localhost")
    .split(",").map((origin) => origin.trim());
  const origin = response.req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-RevenueCat-Webhook-Signature");
  response.setHeader("Access-Control-Max-Age", "600");
}

async function readBody(request: IncomingMessage, maxBytes = 64 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new Error("Request body is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function bearerToken(request: IncomingMessage) {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function optionalUserId(request: IncomingMessage) {
  const token = bearerToken(request);
  if (!token) return null;
  const decoded = await verifyFirebaseIdToken(token);
  return decoded.uid;
}

async function requiredUserId(request: IncomingMessage) {
  const token = bearerToken(request);
  if (!token) throw new Error("Sign in to use your server-saved daily allowance.");
  try {
    const decoded = await verifyFirebaseIdToken(token);
    return decoded.uid;
  } catch {
    throw new Error("Sign in to use your server-saved daily allowance.");
  }
}

export function verifyRevenueCatWebhookSignature(rawBody: Buffer, signature: string) {
  const secret = process.env.REVENUECAT_WEBHOOK_HMAC_SECRET;
  if (!secret) return true;
  const fields = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2)));
  if (!fields.t || !fields.v1 || Math.abs(Date.now() / 1000 - Number(fields.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${fields.t}.`).update(rawBody).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(fields.v1, "hex");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function handleHttpRequest(request: IncomingMessage, response: ServerResponse) {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  try {
    if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
    if (pathname === "/api/usage/consume") {
      const body = JSON.parse((await readBody(request)).toString("utf8")) as JsonRecord;
      if (!isLimitedFeature(body.feature)) return sendJson(response, 400, { error: "Unknown limited feature." });
      const userId = await requiredUserId(request);
      const isPremium = await isRevenueCatPremium(userId);
      if (isPremium) {
        return sendJson(response, 200, {
          allowed: true,
          isPremium: true,
          feature: body.feature,
          used: null,
          limit: null,
          remaining: null,
        });
      }
      const usage = await reserveDailyUsage(userId, body.feature, typeof body.timeZone === "string" ? body.timeZone : "UTC");
      return sendJson(response, usage.allowed ? 200 : 429, usage);
    }

    if (pathname === "/api/subscription/sync") {
      const userId = await requiredUserId(request);
      invalidateRevenueCatSubscriber(userId);
      const isPremium = await isRevenueCatPremium(userId);
      return sendJson(response, 200, { isPremium });
    }

    if (pathname === "/api/analytics/paywall") {
      const body = JSON.parse((await readBody(request)).toString("utf8")) as JsonRecord;
      const event = typeof body.event === "string" ? body.event : "";
      const source = typeof body.source === "string" ? body.source.slice(0, 80) : "unknown";
      if (!new Set(["impression", "purchase", "restore", "purchase_error", "blocked"]).has(event)) {
        return sendJson(response, 400, { error: "Unknown analytics event." });
      }
      const userId = await optionalUserId(request).catch(() => null);
      await getPool().query(
        `INSERT INTO subscription_analytics (user_id, event, source, platform)
         VALUES ($1, $2, $3, $4)`,
        [userId, event, source, typeof body.platform === "string" ? body.platform : "web"],
      );
      return sendJson(response, 202, { accepted: true });
    }

    if (pathname === "/api/revenuecat/webhook") {
      const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
      const providedAuth = request.headers.authorization ?? "";
      if (!expectedAuth || providedAuth !== expectedAuth) return sendJson(response, 401, { error: "Invalid webhook authorization." });
      const rawBody = await readBody(request);
      const signatureHeader = request.headers["x-revenuecat-webhook-signature"];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] ?? "" : signatureHeader ?? "";
      if (!verifyRevenueCatWebhookSignature(rawBody, signature)) {
        return sendJson(response, 401, { error: "Invalid webhook signature." });
      }
      const webhook = JSON.parse(rawBody.toString("utf8")) as {
        event?: { id?: string; type?: string; app_user_id?: string; product_id?: string; event_timestamp_ms?: number };
      };
      const event = webhook.event;
      if (!event?.id || !event.type) return sendJson(response, 400, { error: "Webhook event is incomplete." });
      await getPool().query(
        `INSERT INTO revenuecat_webhook_events (event_id, event_type, app_user_id, product_id, event_at, payload)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6::jsonb)
         ON CONFLICT (event_id) DO NOTHING`,
        [event.id, event.type, event.app_user_id ?? null, event.product_id ?? null, event.event_timestamp_ms ?? Date.now(), rawBody.toString("utf8")],
      );
      invalidateRevenueCatSubscriber(event.app_user_id);
      return sendJson(response, 200, { received: true });
    }

    return sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const statusCode = message.startsWith("Sign in to use") ? 401
      : message.includes("valid IANA timezone") ? 400
      : message.includes("Unknown limited feature") ? 400
      : message.includes("too large") ? 413
      : message.includes("not configured") ? 503
      : 500;
    return sendJson(response, statusCode, { error: statusCode === 500 ? "Request could not be completed." : message });
  }
}