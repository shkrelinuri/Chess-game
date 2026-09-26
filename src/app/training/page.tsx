"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useIsPremium, usePremiumGate, useUsageGate } from "@/components/subscription-provider";
import { FREE_USAGE_LIMITS, type LimitedFeature } from "@/lib/subscriptions/limits";

const dailyActions: { feature: LimitedFeature; eyebrow: string; title: string; detail: string; action: string }[] = [
  { feature: "analysis", eyebrow: "AFTER THE GAME", title: "Engine analysis", detail: "Review the turning points, missed tactics, and best continuations in your game.", action: "Analyze a game" },
  { feature: "puzzle", eyebrow: "TACTICAL PRACTICE", title: "Puzzles", detail: "Solve positions selected to sharpen calculation and pattern recognition.", action: "Start a puzzle" },
  { feature: "puzzleRush", eyebrow: "AGAINST THE CLOCK", title: "Puzzle Rush", detail: "See how many tactics you can solve before the clock runs out.", action: "Start Puzzle Rush" },
];

const premiumActions = [
  { feature: "openingExplorer", eyebrow: "OPENING LIBRARY", title: "Continuation statistics", detail: "Compare common moves, outcomes, and win rates beyond the opening name." },
  { feature: "insights", eyebrow: "YOUR PROGRESS", title: "Personal insights", detail: "Track rating, accuracy, blunders, and performance by opening." },
  { feature: "cosmetics", eyebrow: "MAKE IT YOURS", title: "Exclusive themes", detail: "Browse Premium boards, piece sets, profile frames, and badges." },
];

export default function TrainingPage() {
  const canUse = useUsageGate();
  const canUsePremium = usePremiumGate();
  const isPremium = useIsPremium();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<LimitedFeature | string | null>(null);

  const runDailyFeature = async (feature: LimitedFeature) => {
    setBusy(feature);
    setFeedback("");
    try {
      const allowed = await canUse(feature, `training:${feature}`);
      if (allowed) setFeedback("Your allowance is ready. This feature is being connected to the chess tools.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Your allowance could not be checked.");
    } finally {
      setBusy(null);
    }
  };

  const runPremiumFeature = async (feature: string) => {
    setBusy(feature);
    setFeedback("");
    try {
      if (await canUsePremium(feature, `training:${feature}`)) {
        setFeedback("Premium access confirmed. This feature is being connected to your account data.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="app-shell training-shell">
      <SiteHeader active="play" />
      <div className="training-content">
        <div className="training-heading">
          <div><div className="eyebrow"><span className="eyebrow-line" />PRACTICE & PROGRESS</div><h1>Train with intent<span>.</span></h1><p>Everything you need to make the next game a little better.</p></div>
          <div className={`member-chip ${isPremium ? "member-chip-premium" : ""}`}><span>{isPremium ? "✦" : "♙"}</span>{isPremium ? "PREMIUM MEMBER" : "FREE PLAN"}</div>
        </div>

        {feedback && <div className="training-feedback" role="status">{feedback}</div>}
        <section className="training-section" aria-labelledby="daily-tools">
          <div className="training-section-heading"><div><span className="section-kicker">DAILY PRACTICE</span><h2 id="daily-tools">Your training room</h2></div><span className="training-note">Free daily allowances · Premium is unlimited</span></div>
          <div className="training-grid">
            {dailyActions.map((item, index) => <article className="training-item" key={item.feature}>
              <div className="training-item-top"><span className="training-index">0{index + 1}</span><span className="training-mark">{["⌁", "♞", "◷"][index]}</span></div>
              <span className="section-kicker">{item.eyebrow}</span><h3>{item.title}</h3><p>{item.detail}</p>
              <span className="daily-cap">{isPremium ? "UNLIMITED WITH PREMIUM" : `${FREE_USAGE_LIMITS[item.feature].dailyLimit} FREE PER LOCAL DAY`}</span>
              <button className="training-action" disabled={busy !== null} onClick={() => void runDailyFeature(item.feature)}>{busy === item.feature ? "Checking…" : item.action}<span aria-hidden="true">↗</span></button>
            </article>)}
          </div>
        </section>

        <section className="training-section premium-tools-section" aria-labelledby="premium-tools">
          <div className="training-section-heading"><div><span className="section-kicker">DEEPER INSIGHT</span><h2 id="premium-tools">The bigger picture</h2></div><Link href="/paywall?feature=insights&reason=premium_feature&source=training:overview">Explore Premium <span aria-hidden="true">↗</span></Link></div>
          <div className="training-grid premium-training-grid">
            {premiumActions.map((item, index) => <article className="training-item" key={item.feature}>
              <div className="training-item-top"><span className="training-index">PREMIUM · 0{index + 1}</span><span className="training-mark">{["⌘", "↗", "✦"][index]}</span></div>
              <span className="section-kicker">{item.eyebrow}</span><h3>{item.title}</h3><p>{item.detail}</p>
              <button className="training-action" disabled={busy !== null} onClick={() => void runPremiumFeature(item.feature)}>{busy === item.feature ? "Checking…" : "Open feature"}<span aria-hidden="true">↗</span></button>
            </article>)}
          </div>
        </section>
        <div className="training-footer"><Link href="/">← Back to the board</Link><Link href="/settings">Usage and subscription settings ↗</Link></div>
      </div>
    </main>
  );
}