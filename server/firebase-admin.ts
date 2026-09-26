import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { DecodedIdToken } from "firebase-admin/auth";

function getAdminAuth() {
  if (!getApps().length) {
    const accountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    initializeApp({
      credential: accountJson ? cert(JSON.parse(accountJson)) : applicationDefault(),
      ...(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID } : {}),
    });
  }
  return getAuth();
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  return getAdminAuth().verifyIdToken(token, true);
}