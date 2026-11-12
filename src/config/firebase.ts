import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { env } from './env';

if (getApps().length === 0) {
  if (env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: env.FIREBASE_PROJECT_ID ?? 'demo-chat' });
  } else if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const sa = JSON.parse(readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
    initializeApp({ credential: cert(sa) });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
}

export const firestore = getFirestore();
