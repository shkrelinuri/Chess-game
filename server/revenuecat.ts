import {
  hasPremiumEntitlement,
  PREMIUM_ENTITLEMENT_ID,
  type Entitlements,
} from "../src/lib/subscriptions/entitlements";

type CacheEntry = { entitlements: Entitlements; expiresAt: number };
const subscriberCache = new Map<string, CacheEntry>();
const CACHE_MS = 15_000;

export async function isRevenueCatPremium(appUserId: string) {
  const entitlements = await getRevenueCatEntitlements(appUserId);
  return hasPremiumEntitlement(entitlements);
}

export function invalidateRevenueCatSubscriber(appUserId: string | undefined) {
  if (appUserId) subscriberCache.delete(appUserId);
}

async function getRevenueCatEntitlements(appUserId: string): Promise<Entitlements> {
  const cached = subscriberCache.get(appUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.entitlements;
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) throw new Error("RevenueCat server API is not configured.");

  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 404) {
    const entitlements: Entitlements = {};
    subscriberCache.set(appUserId, { entitlements, expiresAt: Date.now() + CACHE_MS });
    return entitlements;
  }
  if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed (${response.status}).`);

  const payload = await response.json() as {
    subscriber?: {
      entitlements?: Record<string, {
        expires_date?: string | null;
        grace_period_expires_date?: string | null;
      }>;
    };
  };
  const premium = payload.subscriber?.entitlements?.[PREMIUM_ENTITLEMENT_ID];
  const entitlements: Entitlements = premium ? {
    [PREMIUM_ENTITLEMENT_ID]: {
      expires_date: premium.expires_date,
      grace_period_expires_date: premium.grace_period_expires_date,
    },
  } : {};
  subscriberCache.set(appUserId, { entitlements, expiresAt: Date.now() + CACHE_MS });
  return entitlements;
}