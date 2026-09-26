import { getApp, getApps, initializeApp } from "firebase/app";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
  type User,
} from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseAuthConfigured = Object.values(config).every(Boolean);
let cachedAuth: Auth | null = null;

export function getFirebaseAuth() {
  if (typeof window === "undefined" || !firebaseAuthConfigured) return null;
  if (cachedAuth) return cachedAuth;
  const app = getApps().length ? getApp() : initializeApp(config);
  if (!Capacitor.isNativePlatform()) {
    cachedAuth = getAuth(app);
    return cachedAuth;
  }
  try {
    cachedAuth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  } catch {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

export async function signInEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth is not configured yet. Add the Firebase environment variables to enable sign-in.");
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmail(name: string, email: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth is not configured yet. Add the Firebase environment variables to enable sign-up.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await updateProfile(credential.user, { displayName: name });
  } catch (error) {
    console.warn("Account created, but the display name could not be saved.", error);
  }
  return credential;
}

export async function signInSocial(providerName: "google" | "facebook") {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth is not configured yet. Add the Firebase environment variables to enable sign-in.");
  if (Capacitor.isNativePlatform()) {
    const result = providerName === "google"
      ? await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
      : await FirebaseAuthentication.signInWithFacebook({ skipNativeAuth: true });
    const credential = providerName === "google"
      ? GoogleAuthProvider.credential(result.credential?.idToken)
      : FacebookAuthProvider.credential(result.credential?.accessToken ?? "");
    return signInWithCredential(auth, credential);
  }
  const provider = providerName === "google" ? new GoogleAuthProvider() : new FacebookAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut();
  if (auth) await signOut(auth);
}

export type AccountUser = User;