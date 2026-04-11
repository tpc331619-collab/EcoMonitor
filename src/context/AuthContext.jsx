import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // 初始化檢查
  useEffect(() => {
    // 強制超時保護：如果 Firebase 2 秒內沒回應，強制解鎖畫面
    const timer = setTimeout(() => {
      setLoading(false);
      console.warn("Firebase Auth timeout, forcing loading to false.");
    }, 2000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timer);
      setLoading(true);
      if (firebaseUser) {
        // 去 Firestore 查權限
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const docSnap = await getDoc(userRef);
          
          let currentRole = 'pending';

          if (docSnap.exists()) {
            currentRole = docSnap.data().role;
          } else {
            if (firebaseUser.email === 'b28803078@gmail.com') {
              currentRole = 'admin';
            }
            await setDoc(userRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              role: currentRole,
              createdAt: new Date().toISOString()
            });
          }
          
          setUser(firebaseUser);
          setRole(currentRole);
        } catch (error) {
          console.error("Firestore permission error:", error);
          // 權限報錯時，依然要關閉 loading
          setUser({ uid: 'error', displayName: '權限錯誤', email: firebaseUser.email });
          setRole('error');
        }
      } else {
        // 如果沒有 firebaseUser，檢查是否為 Guest (可能存在 sessionStorage 中)
        const guestUser = sessionStorage.getItem('guest_mode');
        if (guestUser === 'true') {
          setUser({ uid: 'guest', displayName: 'Guest', email: 'Guest Account' });
          setRole('guest');
        } else {
          setUser(null);
          setRole(null);
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
      throw error; // 讓 UI 去接
    }
  };

  const loginAsGuest = () => {
    sessionStorage.setItem('guest_mode', 'true');
    setUser({ uid: 'guest', displayName: 'Guest', email: 'Guest Account' });
    setRole('guest');
  };

  const logout = async () => {
    sessionStorage.removeItem('guest_mode');
    await firebaseSignOut(auth);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, loginWithGoogle, loginAsGuest, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
