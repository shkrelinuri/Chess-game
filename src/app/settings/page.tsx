"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSubscription } from "@/components/subscription-provider";

export default function SettingsPage() {
  const { user, isPremium, isLoading, billingState, customerInfo, refreshCustomerInfo, restorePurchases, manageSubscription } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const runAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const stateText = billingState === "active" ? "Active · renewing"
    : billingState === "cancels_at_period_end" ? "Active · will not renew"
    : billingState === "billing_issue" ? "Active · billing issue detected"
    : "Free plan";

  return (
    <main className="app-shell settings-shell">
      <SiteHeader active="account" />
      <div className="settings-content">
        <div className="eyebrow"><span className="eyebrow-line" />ACCOUNT PREFERENCES</div>
        <h1>Settings<span>.</span></h1>
        <p className="settings-intro">Manage your account and membership across web and mobile.</p>
        <section className="settings-section">
          <div className="settings-section-heading"><div><span className="section-kicker">MEMBERSHIP</span><h2>Subscription</h2></div><span className={`settings-status ${isPremium ? "settings-status-premium" : ""}`}>{isLoading ? "Checking…" : stateText}</span></div>
          <div className="settings-row"><div><strong>Plan</strong><span>{isPremium ? "Premium entitlement" : "Free plan · all games remain available"}</span></div>{!isPremium && <Link className="settings-cta" href="/paywall?feature=membership&reason=premium_feature&source=settings">Explore Premium</Link>}</div>
          {isPremium && <div className="settings-row"><div><strong>Subscription management</strong><span>Opens the store or billing portal for this subscription.</span></div><button className="settings-cta" disabled={busy || !customerInfo?.managementURL} onClick={() => void runAction(manageSubscription, "Subscription management opened.")}>Manage subscription</button></div>}
          <div className="settings-row"><div><strong>Restore purchases</strong><span>Recheck purchases made with this Apple, Google, or web account.</span></div><button className="settings-secondary" disabled={busy || !user} onClick={() => void runAction(restorePurchases, "Purchase status refreshed.")}>Restore</button></div>
          <div className="settings-row"><div><strong>Subscription status</strong><span>Refresh entitlement status from RevenueCat.</span></div><button className="settings-secondary" disabled={busy || !user} onClick={() => void runAction(refreshCustomerInfo, "Subscription status refreshed.")}>Refresh</button></div>
          {!user && <div className="settings-callout">Sign in to sync purchases and usage across devices. <Link href="/login">Log in</Link></div>}
          {message && <p className="settings-message" role="status">{message}</p>}
        </section>
        <div className="settings-back"><Link href="/">← Return to the board</Link></div>
      </div>
    </main>
  );
}