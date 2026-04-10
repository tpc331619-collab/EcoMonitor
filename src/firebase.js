import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let app;
let auth;
let db;

try {
  if (!firebaseConfig.apiKey) {
    throw new Error("Missing Firebase API Key");
  }
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  
  // 啟用離線持久化 (Offline Persistence)
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.error("Firebase Initialization Error:", error);
  // 提供一個假的（降級）執行環境，避免整個 App 因為 undefined 而崩潰
  app = {};
  auth = { onAuthStateChanged: () => () => {} }; // 假的訂閱函式
  db = {};
}

export { app, auth, db };
