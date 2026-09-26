"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SiteHeader } from "@/components/site-header";
import { firebaseAuthConfigured, signInEmail, signInSocial, signUpEmail } from "@/lib/firebase-auth";

type AuthMode = "login" | "signup";

function readableAuthError(error: unknown) {
  if (!(error instanceof Error)) return "We couldn't complete that request. Please try again.";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  if (code.includes("auth/invalid-credential")) return "That email and password combination doesn't match.";
  if (code.includes("auth/email-already-in-use")) return "An account already uses that email. Try logging in instead.";
  if (code.includes("auth/weak-password")) return "Choose a stronger password with at least 8 characters.";
  if (code.includes("auth/operation-not-allowed")) return "Email/password sign-up is disabled in Firebase. In Firebase Console, open Authentication → Sign-in method and enable Email/Password.";
  if (code.includes("auth/configuration-not-found")) return "Firebase Authentication is not initialized for this project yet. In Firebase Console, select chess-app-f8e1b → Authentication → Get started, then enable Email/Password under Sign-in method.";
  if (code.includes("auth/invalid-api-key")) return "Firebase rejected the web API key. Check NEXT_PUBLIC_FIREBASE_API_KEY in .env.local, then restart the app.";
  if (code.includes("auth/app-not-authorized") || code.includes("auth/unauthorized-domain")) return "This domain is not authorized in Firebase. Add localhost to Authentication → Settings → Authorized domains.";
  if (code.includes("auth/network-request-failed")) return "Firebase couldn't be reached. Check your connection, VPN, or browser privacy extensions and try again.";
  if (code.includes("auth/too-many-requests")) return "Firebase temporarily blocked requests from this device. Wait a little and try again.";
  if (code.includes("auth/invalid-email")) return "Enter a valid email address.";
  if (code.includes("auth/popup-closed-by-user")) return "The sign-in window was closed before finishing.";
  if (error.message.includes("Firebase Auth is not configured")) return error.message;
  if (code.startsWith("auth/")) return `Firebase sign-up failed (${code}). Check Firebase Authentication → Sign-in method and Authorized domains.`;
  return "We couldn't complete that request. Check your details and try again.";
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const finish = () => router.replace("/");

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (isSignup && password !== confirmPassword) {
      setError("Those passwords don't match yet.");
      return;
    }
    setSubmitting(true);
    try {
      if (isSignup) await signUpEmail(name.trim(), email.trim(), password);
      else await signInEmail(email.trim(), password);
      finish();
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialSignIn = async (provider: "google" | "facebook") => {
    setError("");
    setSubmitting(true);
    try {
      await signInSocial(provider);
      finish();
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <SiteHeader active="account" />
      <div className="auth-layout">
        <aside className="auth-aside">
          <div className="eyebrow auth-eyebrow"><span className="eyebrow-line" />ENDGAME MEMBERS</div>
          <h1>{isSignup ? <>A place for<br />your next move<span>.</span></> : <>Good to have<br />you back<span>.</span></>}</h1>
          <p>Keep your games, progress, and practice in one place. Or keep playing as a guest whenever you like.</p>
          <div className="auth-board" aria-hidden="true">
            <div>♜</div><div className="auth-square-light">♞</div><div>♝</div><div className="auth-square-light">♛</div>
            <div className="auth-square-light">♟</div><div>♟</div><div className="auth-square-light">♟</div><div>♟</div>
            <div>♙</div><div className="auth-square-light">♙</div><div>♙</div><div className="auth-square-light">♙</div>
            <div className="auth-square-light">♖</div><div>♘</div><div className="auth-square-light">♗</div><div>♔</div>
          </div>
          <div className="auth-aside-foot"><span>GUEST PLAY IS ALWAYS OPEN</span><Link href="/">Return to the board <span aria-hidden="true">↗</span></Link></div>
        </aside>

        <section className="auth-form-panel" aria-labelledby="auth-title">
          <div className="auth-form-heading">
            <span className="section-kicker">{isSignup ? "CREATE YOUR ACCOUNT" : "YOUR ACCOUNT"}</span>
            <h2 id="auth-title">{isSignup ? "Sign up" : "Log in"}</h2>
            <p>{isSignup ? "Start free. No account is needed to play." : "Pick up where you left off."}</p>
          </div>

          <div className="social-auth">
            <button type="button" onClick={() => void handleSocialSignIn("google")} disabled={submitting || !firebaseAuthConfigured}><span className="google-mark">G</span> Continue with Google</button>
            <button type="button" onClick={() => void handleSocialSignIn("facebook")} disabled={submitting || !firebaseAuthConfigured}><span className="facebook-mark">f</span> Continue with Facebook</button>
          </div>

          <div className="auth-divider"><span />OR WITH EMAIL<span /></div>

          {!firebaseAuthConfigured && <div className="auth-config-note" role="status">Sign-in is ready to connect. Add the Firebase values from <code>.env.local.example</code> to enable account creation.</div>}
          {error && <div className="auth-error" role="alert">{error}</div>}

          <form className="auth-form" onSubmit={submitForm}>
            {isSignup && <label htmlFor="display-name">Display name<input id="display-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>}
            <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
            {isSignup && <label htmlFor="confirm-password">Confirm password<input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} /></label>}
            <button className="auth-submit" type="submit" disabled={submitting || !firebaseAuthConfigured}>{submitting ? "Please wait…" : isSignup ? "Create free account" : "Log in"}</button>
          </form>

          <p className="auth-switch">{isSignup ? "Already have an account?" : "New to Endgame?"} <Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Create a free account"}</Link></p>
          <p className="auth-guest-note">No sign-in wall. <Link href="/">Play as a guest</Link></p>
        </section>
      </div>
    </main>
  );
}