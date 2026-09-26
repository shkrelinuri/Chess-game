"use client";

import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { getFirebaseAuth, signOutUser, type AccountUser } from "@/lib/firebase-auth";

type SiteHeaderProps = { active?: "play" | "membership" | "account" };

export function SiteHeader({ active = "play" }: SiteHeaderProps) {
  const [user, setUser] = useState<AccountUser | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Endgame home">
        <span className="brand-mark">E</span><span>ENDGAME</span>
      </Link>
      <nav className="top-nav" aria-label="Main navigation">
        <Link className={active === "play" ? "nav-active" : ""} href="/">Play</Link>
        <Link href="/training">Train</Link>
        <Link className={active === "membership" ? "nav-active" : ""} href="/membership">Premium</Link>
      </nav>
      {user ? (
        <details className="account-menu">
          <summary className="profile-chip">
            <span className="avatar">{(user.displayName ?? user.email ?? "Y").slice(0, 1).toUpperCase()}</span>
            <span>{user.displayName ?? user.email?.split("@")[0] ?? "Account"}</span>
          </summary>
          <div className="account-popover">
            <span className="account-email">{user.email}</span>
            <Link href="/settings">Settings</Link>
            <Link href="/membership">Premium plan</Link>
            <button onClick={() => void signOutUser()}>Sign out</button>
          </div>
        </details>
      ) : (
        <div className="guest-links">
          <Link href="/login">Log in</Link>
          <Link className="guest-signup" href="/signup">Sign up</Link>
        </div>
      )}
    </header>
  );
}