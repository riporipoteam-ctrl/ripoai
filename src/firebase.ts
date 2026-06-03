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
  // Use the Firebase Hosting domain as the auth domain so that, when the app
  // is served from https://ripoai-dff5d.web.app, the Google OAuth handler is
  // SAME-ORIGIN. That's what makes Google sign-in work in an installed
  // (home-screen) PWA — cross-origin handlers get their storage partitioned
  // by the browser and the credential never comes back. (.web.app and
  // .firebaseapp.com are both auto-authorized domains for the project.)
  authDomain: 'ripoai-dff5d.web.app',
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
