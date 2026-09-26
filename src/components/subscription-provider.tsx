"use client";

import { App } from "@capacitor/app";
import { AppLauncher } from "@capacitor/app-launcher";
import { Capacitor } from "@capacitor/core";
import { Purchases as NativePurchases, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { Purchases as WebPurchases, type Package as WebPackage } from "@revenuecat/purchases-js";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getFirebaseAuth } from "@/lib/firebase-auth";
import { hasPremiumEntitlement, PREMIUM_ENTITLEMENT_ID, type Entitlements } from "@/lib/subscriptions/entitlements";
import { FREE_USAGE_LIMITS, type LimitedFeature } from "@/lib/subscriptions/limits";

type BillingInterval = "monthly" | "annual";
type BillingPackage = { interval: BillingInterval; raw: unknown; priceText: string; amount: number | null; currency: string | null };
type CustomerSnapshot = {
  entitlements: { active: Entitlements; all: Entitlements };
  managementURL: string | null;
};
type BillingState = "free" | "active" | "cancels_at_period_end" | "billing_issue";
type SubscriptionContextValue = {
  user: User | null;
  customerInfo: CustomerSnapshot | null;
  isPremium: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  error: string;
  billingState: BillingState;
  packages: Partial<Record<BillingInterval, BillingPackage>>;
  annualDiscountPercent: number | null;
  refreshCustomerInfo: () => Promise<void>;
  purchase: (interval: BillingInterval, source: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  manageSubscription: () => Promise<void>;
  trackEvent: (event: "impression" | "purchase" | "restore" | "purchase_error" | "blocked", source: string) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
let nativeConfiguration: Promise<void> | null = null;
let webPurchases: InstanceType<typeof WebPurchases> | null = null;
let webConfiguration: Promise<InstanceType<typeof WebPurchases>> | null = null;
const EMPTY_PACKAGES: Partial<Record<BillingInterval, BillingPackage>> = {};

function configuredKeys() {
  return {
    native: Capacitor.getPlatform() === "ios"
      ? process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY,
    web: process.env.NEXT_PUBLIC_REVENUECAT_WEB_KEY,
  };
}

function mapCustomerInfo(value: unknown): CustomerSnapshot {
  const customer = value as {
    entitlements?: { active?: Record<string, unknown>; all?: Record<string, unknown> };
    managementURL?: string | null;
    managementUrl?: string | null;
  };
  return {
    entitlements: {
      active: (customer?.entitlements?.active ?? {}) as Entitlements,
      all: (customer?.entitlements?.all ?? customer?.entitlements?.active ?? {}) as Entitlements,
    },
    managementURL: customer?.managementURL ?? customer?.managementUrl ?? null,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizePackage(interval: BillingInterval, raw: unknown): BillingPackage {
  const record = objectValue(raw);
  const product = objectValue(record.product ?? record.webBillingProduct);
  const price = product.price;
  const priceObject = objectValue(price);
  const amountValue = typeof price === "number" ? price : priceObject.amount;
  const amount = typeof amountValue === "number" ? amountValue : typeof amountValue === "string" ? Number(amountValue) : null;
  const currency = typeof priceObject.currency === "string"
    ? priceObject.currency
    : typeof product.currencyCode === "string" ? product.currencyCode : null;
  const priceText = [product.priceString, priceObject.formatted, priceObject.displayPrice]
    .find((value): value is string => typeof value === "string" && value.length > 0)
    ?? (amount !== null && currency ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount) : "Price unavailable");
  return { interval, raw, priceText, amount: Number.isFinite(amount) ? amount : null, currency };
}

async function getNativeCustomerInfo() {
  return (await NativePurchases.getCustomerInfo()).customerInfo;
}

async function syncServerEntitlement(userId: string) {
  try {
    const currentUser = getFirebaseAuth()?.currentUser;
    if (!currentUser || currentUser.uid !== userId) return;
    const token = await currentUser.getIdToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/api/subscription/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
  } catch {
    // RevenueCat's webhook remains the durable sync path while the client is offline.
  }
}

async function getWebClient(userId: string) {
  const keys = configuredKeys();
  if (!keys.web) throw new Error("RevenueCat Web Billing is not configured.");
  if (!webConfiguration) {
    webConfiguration = Promise.resolve(WebPurchases.configure({ apiKey: keys.web, appUserId: userId }));
  }
  try {
    webPurchases = await webConfiguration;
  } catch (error) {
    webConfiguration = null;
    throw error;
  }
  if (webPurchases.getAppUserId() !== userId) await webPurchases.changeUser(userId);
  return webPurchases;
}

async function configureNativePurchases(userId: string) {
  const keys = configuredKeys();
  if (!keys.native) throw new Error(`RevenueCat ${Capacitor.getPlatform()} purchases are not configured.`);
  if (!nativeConfiguration) {
    nativeConfiguration = (async () => {
      try {
        await NativePurchases.getAppUserID();
      } catch {
        await NativePurchases.configure({ apiKey: keys.native!, appUserID: userId });
      }
    })().catch((error) => {
      nativeConfiguration = null;
      throw error;
    });
  }
  await nativeConfiguration;
  const current = await NativePurchases.getAppUserID();
  if (current.appUserID !== userId) await NativePurchases.logIn({ appUserID: userId });
}

function getPackages(offerings: unknown): Partial<Record<BillingInterval, BillingPackage>> {
  const current = objectValue(objectValue(offerings).current);
  const monthly = current.monthly;
  const annual = current.annual;
  return {
    ...(monthly ? { monthly: normalizePackage("monthly", monthly as PurchasesPackage | WebPackage) } : {}),
    ...(annual ? { annual: normalizePackage("annual", annual as PurchasesPackage | WebPackage) } : {}),
  };
}

function getBillingState(info: CustomerSnapshot | null, isPremium: boolean): BillingState {
  if (!isPremium) return "free";
  const premium = info?.entitlements.active[PREMIUM_ENTITLEMENT_ID] as {
    billingIssueDetectedAt?: Date | string | null;
    willRenew?: boolean;
  } | undefined;
  if (premium?.billingIssueDetectedAt) return "billing_issue";
  if (premium?.willRenew === false) return "cancels_at_period_end";
  return "active";
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerSnapshot | null>(null);
  const [packages, setPackages] = useState<Partial<Record<BillingInterval, BillingPackage>>>({});
  const [billingLoading, setBillingLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [error, setError] = useState("");
  const visibleCustomerInfo = user ? customerInfo : null;
  const visiblePackages = user ? packages : EMPTY_PACKAGES;
  const isLoading = !authReady || (Boolean(user) && billingLoading);
  const isPremium = hasPremiumEntitlement(visibleCustomerInfo?.entitlements.active);
  const billingState = getBillingState(visibleCustomerInfo, isPremium);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      const timer = window.setTimeout(() => setAuthReady(true), 0);
      return () => window.clearTimeout(timer);
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  const syncCustomerInfo = useCallback(async () => {
    if (!user) return null;
    if (Capacitor.isNativePlatform()) {
      const info = mapCustomerInfo(await getNativeCustomerInfo());
      setCustomerInfo(info);
      void syncServerEntitlement(user.uid);
      return info;
    }
    const client = await getWebClient(user.uid);
    const info = mapCustomerInfo(await client.getCustomerInfo());
    setCustomerInfo(info);
    void syncServerEntitlement(user.uid);
    return info;
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    let nativeListenerId: string | null = null;
    const native = Capacitor.isNativePlatform();

    if (!user) return;

    void (async () => {
      setBillingLoading(true);
      setError("");
      setCustomerInfo(null);
      setPackages({});
      setIsConfigured(false);
      try {
        let offerings: unknown;
        let info: unknown;
        if (native) {
          await configureNativePurchases(user.uid);
          [offerings, info] = await Promise.all([NativePurchases.getOfferings(), getNativeCustomerInfo()]);
          nativeListenerId = await NativePurchases.addCustomerInfoUpdateListener((updated) => {
            if (!cancelled) {
              setCustomerInfo(mapCustomerInfo(updated));
              void syncServerEntitlement(user.uid);
            }
          });
        } else {
          const client = await getWebClient(user.uid);
          [offerings, info] = await Promise.all([client.getOfferings(), client.getCustomerInfo()]);
        }
        if (cancelled) return;
        setCustomerInfo(mapCustomerInfo(info));
        void syncServerEntitlement(user.uid);
        setPackages(getPackages(offerings));
        setIsConfigured(true);
      } catch (cause) {
        if (!cancelled) {
          setCustomerInfo(null);
          setError(cause instanceof Error ? cause.message : "Subscription status could not be loaded.");
          setIsConfigured(false);
        }
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    })();

    const refreshIfActive = () => {
      if (!cancelled && document.visibilityState === "visible") void syncCustomerInfo().catch(() => undefined);
    };
    window.addEventListener("focus", refreshIfActive);
    document.addEventListener("visibilitychange", refreshIfActive);
    let appStateListener: { remove: () => Promise<void> } | null = null;
    if (native) {
      void App.addListener("appStateChange", ({ isActive }) => {
        if (isActive && !cancelled) void syncCustomerInfo().catch(() => undefined);
      }).then((listener) => { appStateListener = listener; });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshIfActive);
      document.removeEventListener("visibilitychange", refreshIfActive);
      if (nativeListenerId) void NativePurchases.removeCustomerInfoUpdateListener({ listenerToRemove: nativeListenerId });
      if (appStateListener) void appStateListener.remove();
    };
  }, [syncCustomerInfo, user]);

  const refreshCustomerInfo = useCallback(async () => {
    if (!user) throw new Error("Sign in to sync your subscriptions.");
    if (Capacitor.isNativePlatform()) await NativePurchases.invalidateCustomerInfoCache();
    await syncCustomerInfo();
  }, [syncCustomerInfo, user]);

  const trackEvent = useCallback(async (event: "impression" | "purchase" | "restore" | "purchase_error" | "blocked", source: string) => {
    try {
      const token = await getFirebaseAuth()?.currentUser?.getIdToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/api/analytics/paywall`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ event, source, platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web" }),
        keepalive: true,
      });
    } catch {
      // Analytics should never block a purchase or game action.
    }
  }, []);

  const purchase = useCallback(async (interval: BillingInterval, source: string) => {
    const selected = packages[interval];
    if (!user || !selected || !isConfigured) throw new Error("Subscription purchase is not ready.");
    try {
      let info: unknown;
      if (Capacitor.isNativePlatform()) {
        info = (await NativePurchases.purchasePackage({ aPackage: selected.raw as PurchasesPackage })).customerInfo;
      } else {
        const client = await getWebClient(user.uid);
        info = (await client.purchase({ rcPackage: selected.raw as WebPackage, customerEmail: user.email ?? undefined })).customerInfo;
      }
      setCustomerInfo(mapCustomerInfo(info));
      void syncServerEntitlement(user.uid);
      await trackEvent("purchase", source);
    } catch (cause) {
      await trackEvent("purchase_error", source);
      throw cause;
    }
  }, [isConfigured, packages, trackEvent, user]);

  const restorePurchases = useCallback(async () => {
    if (!user) throw new Error("Sign in to restore your purchases.");
    if (Capacitor.isNativePlatform()) {
      const restored = await NativePurchases.restorePurchases();
      setCustomerInfo(mapCustomerInfo(restored.customerInfo));
    } else {
      const client = await getWebClient(user.uid);
      await client.changeUser(user.uid);
      setCustomerInfo(mapCustomerInfo(await client.getCustomerInfo()));
    }
    void syncServerEntitlement(user.uid);
    await trackEvent("restore", "settings");
  }, [trackEvent, user]);

  const manageSubscription = useCallback(async () => {
    if (!user) throw new Error("Sign in to manage subscriptions.");
    if (Capacitor.isNativePlatform()) await NativePurchases.invalidateCustomerInfoCache();
    const freshInfo = await syncCustomerInfo();
    const url = freshInfo?.managementURL;
    if (!url) throw new Error("No active subscription was found for this account.");
    if (Capacitor.isNativePlatform()) await AppLauncher.openUrl({ url });
    else window.location.assign(url);
  }, [syncCustomerInfo, user]);

  const annualDiscountPercent = useMemo(() => {
    const monthly = packages.monthly;
    const annual = packages.annual;
    if (!monthly?.amount || !annual?.amount || monthly.currency !== annual.currency) return null;
    const fullYear = monthly.amount * 12;
    if (fullYear <= annual.amount) return null;
    return Math.round((1 - annual.amount / fullYear) * 100);
  }, [packages]);

  const value = useMemo<SubscriptionContextValue>(() => ({
    user,
    customerInfo: visibleCustomerInfo,
    isPremium,
    isLoading,
    isConfigured,
    error,
    billingState,
    packages: visiblePackages,
    annualDiscountPercent,
    refreshCustomerInfo,
    purchase,
    restorePurchases,
    manageSubscription,
    trackEvent,
  }), [user, visibleCustomerInfo, isPremium, isLoading, isConfigured, error, billingState, visiblePackages, annualDiscountPercent, refreshCustomerInfo, purchase, restorePurchases, manageSubscription, trackEvent]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error("SubscriptionProvider is missing from the app tree.");
  return context;
}

export function useIsPremium() {
  return useSubscriptionContext().isPremium;
}

export function useSubscription() {
  return useSubscriptionContext();
}

export function useUsageGate() {
  const router = useRouter();
  const { isLoading, trackEvent } = useSubscriptionContext();

  return useCallback(async (feature: LimitedFeature, source: string = feature) => {
    if (isLoading) return false;
    const user = getFirebaseAuth()?.currentUser;
    if (!user) {
      await trackEvent("blocked", source);
      router.push(`/paywall?feature=${encodeURIComponent(feature)}&reason=account_required&source=${encodeURIComponent(source)}`);
      return false;
    }
    const token = await user.getIdToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/api/usage/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feature, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    const result = await response.json() as { allowed?: boolean; used?: number; limit?: number; error?: string };
    if (response.ok && result.allowed) return true;
    await trackEvent("blocked", source);
    const reason = response.status === 429 ? "daily_limit" : "usage_error";
    router.push(`/paywall?feature=${encodeURIComponent(feature)}&reason=${reason}&used=${result.used ?? ""}&limit=${result.limit ?? FREE_USAGE_LIMITS[feature].dailyLimit}&source=${encodeURIComponent(source)}`);
    return false;
  }, [isLoading, router, trackEvent]);
}

export function usePremiumGate() {
  const router = useRouter();
  const { isLoading, trackEvent } = useSubscriptionContext();
  return useCallback(async (feature: string, source = feature) => {
    if (isLoading) return false;
    const user = getFirebaseAuth()?.currentUser;
    if (!user) {
      await trackEvent("blocked", source);
      router.push(`/paywall?feature=${encodeURIComponent(feature)}&reason=account_required&source=${encodeURIComponent(source)}`);
      return false;
    }
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/api/subscription/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok && (await response.json() as { isPremium?: boolean }).isPremium) return true;
    } catch {
      // Fail closed if the entitlement service cannot confirm access.
    }
    await trackEvent("blocked", source);
    router.push(`/paywall?feature=${encodeURIComponent(feature)}&reason=premium_feature&source=${encodeURIComponent(source)}`);
    return false;
  }, [isLoading, router, trackEvent]);
}