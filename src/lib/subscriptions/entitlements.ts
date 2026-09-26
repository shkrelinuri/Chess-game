export const PREMIUM_ENTITLEMENT_ID = "premium";

export type EntitlementState = {
  isActive?: boolean;
  expirationDate?: Date | string | null;
  expires_date?: Date | string | null;
  gracePeriodExpiresDate?: Date | string | null;
  grace_period_expires_date?: Date | string | null;
};

export type Entitlements = Record<string, EntitlementState | undefined>;

function timestamp(value: Date | string | null | undefined) {
  if (value == null) return null;
  const valueMs = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(valueMs) ? valueMs : null;
}

export function hasPremiumEntitlement(entitlements: Entitlements | null | undefined, nowMs = Date.now()) {
  const entitlement = entitlements?.[PREMIUM_ENTITLEMENT_ID];
  if (!entitlement) return false;
  const expiresAt = timestamp(entitlement.expirationDate ?? entitlement.expires_date);
  const graceExpiresAt = timestamp(entitlement.gracePeriodExpiresDate ?? entitlement.grace_period_expires_date);
  if (graceExpiresAt !== null && graceExpiresAt > nowMs) return true;
  if (typeof entitlement.isActive === "boolean") return entitlement.isActive;
  return expiresAt === null || expiresAt > nowMs;
}