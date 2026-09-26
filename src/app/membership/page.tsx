"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useSubscription } from "@/components/subscription-provider";

type BillingInterval = "monthly" | "annual";

const plannedBenefits = [
  "A searchable archive of your games",
  "Expanded post-game analysis",
  "Rating history and personal insights",
  "Advanced puzzle training and progress",
];

export default function MembershipPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const { packages, annualDiscountPercent, isConfigured, isPremium } = useSubscription();

  return (
    <main className="app-shell membership-shell">
      <SiteHeader active="membership" />
      <div className="membership-content">
        <div className="membership-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" />ENDGAME MEMBERSHIP</div>
            <h1>More room to improve<span>.</span></h1>
            <p className="membership-intro">Play stays open to everyone. An account keeps your progress together; Premium is being designed for players who want to go further.</p>
          </div>
          <Link className="return-board-link" href="/">Back to the board <span aria-hidden="true">↗</span></Link>
        </div>

        <div className="billing-choice">
          <span className="control-label">BILLING PERIOD</span>
          <div className="billing-switch" role="group" aria-label="Choose billing period">
            <button type="button" className={interval === "monthly" ? "billing-selected" : ""} aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
            <button type="button" className={interval === "annual" ? "billing-selected" : ""} aria-pressed={interval === "annual"} onClick={() => setInterval("annual")}>Annual</button>
          </div>
        </div>

        <section className="plans-grid" aria-label="Membership options">
          <article className="plan-panel free-plan">
            <div className="plan-topline"><span className="section-kicker">OPEN TO EVERYONE</span><span className="plan-symbol">♙</span></div>
            <h2>Free</h2>
            <p className="plan-description">The full game, no account required.</p>
            <div className="plan-price">$0 <span>forever</span></div>
            <ul className="plan-features">
              <li>Play the computer at any time</li>
              <li>Match online opponents</li>
              <li>All listed time controls</li>
              <li>Use the app as a guest</li>
            </ul>
            <Link className="plan-link free-plan-link" href="/">Play free</Link>
          </article>

          <article className="plan-panel premium-plan">
            <div className="plan-topline"><span className="section-kicker">IN DEVELOPMENT</span><span className="premium-stamp">PREMIUM</span></div>
            <h2>Premium</h2>
            <p className="plan-description">More ways to understand and track your chess.</p>
            <div className="plan-price plan-price-tbd">{packages[interval]?.priceText ?? "Pricing unavailable"} <span>{interval === "monthly" ? "per month" : "per year"}</span></div>
            {interval === "annual" && annualDiscountPercent !== null && <div className="membership-discount">SAVE {annualDiscountPercent}% WHEN BILLED ANNUALLY</div>}
            <div className="planned-label">PROPOSED BENEFITS · NOT AVAILABLE YET</div>
            <ul className="plan-features planned-features">
              {plannedBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
            </ul>
            <Link className="plan-link premium-plan-link" href="/paywall?feature=membership&reason=premium_feature&source=membership">{isPremium ? "Manage membership" : isConfigured ? "See Premium offer" : "View Premium offer"}</Link>
          </article>
        </section>

        <div className="membership-footnote">
          <span className="footnote-mark">i</span>
          <p>No payment details are collected and no charges are made. Prices, billing, cancellation, and final benefits will be published before subscriptions open.</p>
          <Link href="/signup">Create a free account <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </main>
  );
}