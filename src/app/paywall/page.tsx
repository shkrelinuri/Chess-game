"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSubscription } from "@/components/subscription-provider";
import { FREE_USAGE_LIMITS, isLimitedFeature } from "@/lib/subscriptions/limits";

const benefits = [
  { icon: "◇", title: "Every game, fully analyzed", detail: "No daily analysis cap. Review every decision with engine-powered insights." },
  { icon: "♟", title: "Train without limits", detail: "Unlimited tactical puzzles and Puzzle Rush attempts." },
  { icon: "⌘", title: "See the story in your openings", detail: "Explore continuation stats, outcomes, and win rates." },
  { icon: "↗", title: "Know how your chess is changing", detail: "Track rating, accuracy, blunders, and opening performance." },
  { icon: "✦", title: "Make it your own", detail: "Unlock exclusive boards, pieces, profile frames, and badges." },
  { icon: "✉", title: "A direct line when you need us", detail: "Priority support for Premium members." },
];

function featureName(feature: string) {
  if (isLimitedFeature(feature)) return FREE_USAGE_LIMITS[feature].displayName;
  const labels: Record<string, string> = {
    openingExplorer: "Opening explorer move statistics",
    insights: "Personal insights dashboard",
    cosmetics: "Premium board and profile cosmetics",
    prioritySupport: "Priority support",
    ads: "Ad-free games",
  };
  return labels[feature] ?? "this Premium feature";
}

function PaywallContent() {
  const search = useSearchParams();
  const { user, isPremium, isLoading, isConfigured, error, packages, annualDiscountPercent, purchase, restorePurchases, trackEvent } = useSubscription();
  const feature = search.get("feature") ?? "premium";
  const reason = search.get("reason") ?? "premium_feature";
  const source = search.get("source") ?? feature;
  const usedValue = search.get("used");
  const used = usedValue ? Number(usedValue) : null;
  const limit = Number(search.get("limit")) || (isLimitedFeature(feature) ? FREE_USAGE_LIMITS[feature].dailyLimit : 0);
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const trackedImpression = useRef("");

  useEffect(() => {
    if (trackedImpression.current !== source) {
      trackedImpression.current = source;
      void trackEvent("impression", source);
    }
  }, [source, trackEvent]);

  const contextMessage = useMemo(() => {
    if (reason === "daily_limit" && isLimitedFeature(feature)) {
      if (feature === "analysis") return `You've used your ${limit} free analyses today${used === null ? "" : ` (${used} used)`}.`;
      if (feature === "puzzle") return `You've solved your ${limit} free puzzles today${used === null ? "" : ` (${used} used)`}.`;
      return `You've used your free Puzzle Rush attempt today${used === null ? "" : ` (${used} used)`}.`;
    }
    if (reason === "account_required") return "Create a free account to save your daily usage and check Premium access across devices.";
    return `${featureName(feature)} is part of Premium.`;
  }, [feature, limit, reason, used]);

  const selectedPackage = packages[interval];
  const monthlyEquivalent = interval === "annual" && packages.annual && packages.monthly && packages.annual.currency === packages.monthly.currency
    ? (packages.annual.amount ?? 0) / 12
    : null;
  const monthlyEquivalentText = monthlyEquivalent !== null && packages.annual?.currency
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: packages.annual.currency }).format(monthlyEquivalent)
    : null;

  const startPurchase = async () => {
    if (!user) {
      setMessage("Sign in or create a free account before starting a subscription.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await purchase(interval, source);
      setMessage("Premium is active on your account.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The purchase could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setMessage("");
    try {
      await restorePurchases();
      setMessage("Purchase status refreshed.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Purchases could not be restored.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell paywall-shell">
      <SiteHeader active="membership" />
      <div className="paywall-content">
        <Link className="paywall-back" href="/">← Back to your game</Link>
        <section className="paywall-hero">
          <div className="paywall-copy">
            <div className="eyebrow"><span className="eyebrow-line" />ENDGAME PREMIUM</div>
            <div className="paywall-seal" aria-hidden="true">♛</div>
            <h1>Make every game<br />teach you more<span>.</span></h1>
            <p className="paywall-context">{contextMessage}</p>
            <p className="paywall-intro">Go beyond the board with deeper analysis, unlimited training, and a clearer view of your progress.</p>
          </div>
          <div className="paywall-offer">
            <div className="paywall-offer-top"><span>MEMBERSHIP OFFER</span><span>ALL THE WAY UP</span></div>
            <div className="billing-switch paywall-billing" role="group" aria-label="Choose subscription period">
              <button className={interval === "monthly" ? "billing-selected" : ""} aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
              <button className={interval === "annual" ? "billing-selected" : ""} aria-pressed={interval === "annual"} onClick={() => setInterval("annual")}>Annual {annualDiscountPercent !== null && <span className="discount-chip">SAVE {annualDiscountPercent}%</span>}</button>
            </div>
            <div className="paywall-price">
              {selectedPackage ? <><strong>{selectedPackage.priceText}</strong><span>/{interval === "monthly" ? "month" : "year"}</span></> : <><strong>{isConfigured ? "Price unavailable" : "Connect RevenueCat"}</strong></>}
            </div>
            {monthlyEquivalentText && interval === "annual" && <p className="price-equivalent">That&apos;s {monthlyEquivalentText} per month, billed annually.</p>}
            <p className="renewal-caption">Subscription renews unless canceled in your store settings.</p>
            {isPremium ? <div className="premium-active-note">Premium is already active on this account.</div> : <button className="paywall-purchase" disabled={busy || isLoading || !selectedPackage || !isConfigured} onClick={() => void startPurchase()}>{busy ? "Connecting securely…" : selectedPackage ? "Continue with Premium" : "Premium subscriptions unavailable"}<span aria-hidden="true">↗</span></button>}
            {!user && <p className="signin-before-purchase">A free account is required to sync Premium across web and mobile.</p>}
            <button className="restore-purchases" disabled={busy || !user} onClick={() => void restore()}>Restore purchases</button>
            <p className="billing-note">Billed securely through {typeof window !== "undefined" && /Capacitor/.test(navigator.userAgent) ? "your app store" : "RevenueCat Web Billing"}.</p>
            {!isConfigured && <p className="billing-note billing-setup">{error || "Add RevenueCat public keys and configure a current offering with monthly and annual packages."}</p>}
            {message && <p className="purchase-message" role="status">{message}</p>}
          </div>
        </section>

        <section className="benefits-section" aria-labelledby="benefits-title">
          <div className="benefits-heading"><div className="section-kicker">BUILT FOR THE NEXT LEVEL</div><h2 id="benefits-title">More insight. More practice. More you.</h2></div>
          <div className="benefits-grid">
            {benefits.map((benefit, index) => <article className="benefit-item" key={benefit.title}>
              <span className="benefit-icon">{benefit.icon}</span><div><span className="benefit-number">0{index + 1}</span><h3>{benefit.title}</h3><p>{benefit.detail}</p></div>
            </article>)}
          </div>
        </section>
        <footer className="paywall-footer"><span>Already subscribed through another store?</span><button onClick={() => void restore()} disabled={busy || !user}>Restore purchases</button><Link href="/settings">Subscription settings</Link></footer>
      </div>
    </main>
  );
}

export default function PaywallPage() {
  return <Suspense fallback={<main className="app-shell"><div className="paywall-loading">Loading your membership offer…</div></main>}><PaywallContent /></Suspense>;
}