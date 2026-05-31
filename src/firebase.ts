import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Firebase web config is safe to ship in the client by design — access is
// governed by Firebase Auth + Firestore security rules, not by hiding this.
const firebaseConfig = {
  apiKey: 'AIzaSyA-4hkATjzLE-nS0eDf09qs_8MWGc_iRPA',
  authDomain: 'ripoai-dff5d.firebaseapp.com',
  databaseURL: 'https://ripoai-dff5d-default-rtdb.firebaseio.com',
  projectId: 'ripoai-dff5d',
  storageBucket: 'ripoai-dff5d.firebasestorage.app',
  messagingSenderId: '142008911833',
  appId: '1:142008911833:web:fd73df454c5e66fe4abbc8',
  measurementId: 'G-Z4ZKXJ989C',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

// Keep users signed in across reloads.
void setPersistence(auth, browserLocalPersistence)
