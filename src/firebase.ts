import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { toast } from 'sonner';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Handle redirect result if the user was redirected back from Google
getRedirectResult(auth).then((result) => {
  if (result) {
    toast.success('Google ဖြင့် အောင်မြင်စွာ အကောင့်ဝင်ပြီးပါပြီ');
  }
}).catch((error) => {
  console.error("Error with redirect login", error);
  toast.error(`အကောင့်ဝင်ခြင်း မအောင်မြင်ပါ: ${error.message}`);
});

export const loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    console.error("Error signing in with Google popup", error);
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.message.includes('popup')) {
      toast.info('Popup ပိတ်သွားပါသည်။ အခြားနည်းလမ်းဖြင့် ကြိုးစားနေပါသည်...');
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectError: any) {
        console.error("Error signing in with redirect", redirectError);
        toast.error(`အကောင့်ဝင်ခြင်း မအောင်မြင်ပါ: ${redirectError.message || 'Unknown error'}`);
      }
    } else {
      toast.error(`အကောင့်ဝင်ခြင်း မအောင်မြင်ပါ: ${error.message || 'Unknown error'}`);
    }
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
