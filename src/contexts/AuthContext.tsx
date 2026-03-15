import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

interface AuthContextType {
  currentUser: User | null;
  userData: any | null;
  tenantData: any | null;
  isAuthReady: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [tenantData, setTenantData] = useState<any | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // Fetch user data
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          } else {
            // Check if there's a pre-created user document with this email
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', user.email));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              // Link this UID to the existing user document
              const existingDoc = querySnapshot.docs[0];
              const existingData = existingDoc.data();
              
              // Create the document with the actual UID
              await setDoc(doc(db, 'users', user.uid), {
                ...existingData,
                name: user.displayName || existingData.name,
                updatedAt: new Date().toISOString()
              });
              
              // Delete the temporary document
              await deleteDoc(doc(db, 'users', existingDoc.id));
              
              setUserData(existingData);
            } else if (user.email === 'harddisk1911@gmail.com') {
              // Auto-create SuperAdmin account
              const tenantId = 't-superadmin';
              await setDoc(doc(db, 'tenants', tenantId), {
                name: 'Administração do Sistema',
                plan: 'SuperAdmin',
                createdAt: new Date().toISOString()
              });
              
              const newUserData = {
                tenantId,
                email: user.email,
                name: user.displayName || 'Super Admin',
                role: 'SuperAdmin',
                createdAt: new Date().toISOString()
              };
              await setDoc(doc(db, 'users', user.uid), newUserData);
              setUserData(newUserData);
            } else {
              // New user not found in pre-created list.
              // We no longer auto-create tenants.
              // The user must be invited by an admin.
              setUserData({
                unauthorized: true,
                email: user.email,
                name: user.displayName
              });
            }
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserData(null);
      }
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchTenant = async () => {
      if (userData?.tenantId) {
        try {
          const tenantDoc = await getDoc(doc(db, 'tenants', userData.tenantId));
          if (tenantDoc.exists()) {
            setTenantData(tenantDoc.data());
          }
        } catch (error) {
          console.error("Error fetching tenant data:", error);
        }
      } else {
        setTenantData(null);
      }
    };
    fetchTenant();
  }, [userData?.tenantId]);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userData, tenantData, isAuthReady, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
