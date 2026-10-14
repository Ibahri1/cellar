
import { initializeApp } from 'firebase/app';
import {
  browserSessionPersistence,
  initializeAuth,
  type Auth
} from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore';
import { authenticateAdmin } from './auth';

export const adminEmail = import.meta.env.VITE_FIREBASE_ADMIN_EMAIL?.trim() ?? '';
export const adminUid = import.meta.env.VITE_FIREBASE_ADMIN_UID?.trim() ?? '';

const options = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? ''
};

const requiredConfig = {
  VITE_FIREBASE_API_KEY: options.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: options.authDomain,
  VITE_FIREBASE_PROJECT_ID: options.projectId,
  VITE_FIREBASE_APP_ID: options.appId,
  VITE_FIREBASE_ADMIN_EMAIL: adminEmail,
  VITE_FIREBASE_ADMIN_UID: adminUid
};

const missingVariables = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([name]) => name);

export let firebaseSetupError = '';

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (missingVariables.length > 0) {
  firebaseSetupError = `Missing Firebase configuration: ${missingVariables.join(', ')}`;
  console.error(firebaseSetupError);
} else {
  try {
    const app = initializeApp(options);

    authInstance = initializeAuth(app, {
      persistence: browserSessionPersistence
    });

    dbInstance = initializeFirestore(app, {
      localCache: memoryLocalCache()
    });
  } catch (error) {
    firebaseSetupError = 'Firebase initialization failed.';
    console.error(firebaseSetupError, error);
  }
}

export const auth = authInstance;
export const db = dbInstance;

export async function loginWithPassword(password: string) {
  if (!auth) {
    throw new Error(firebaseSetupError || 'Firebase is not configured.');
  }

  await authenticateAdmin(auth, adminEmail, password, adminUid);
}
