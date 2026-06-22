import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, onSnapshot, serverTimestamp, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

const FB_CONFIG = {
  apiKey: 'AIzaSyCJrrsphUju-NUfCavyob4nhwW5pxsLvx0',
  authDomain: 'names-roulette.firebaseapp.com',
  projectId: 'names-roulette',
  storageBucket: 'names-roulette.firebasestorage.app',
  messagingSenderId: '874509368006',
  appId: '1:874509368006:web:2541d2aa87ae67eb07f5c7',
}

export const fbApp = initializeApp(FB_CONFIG)
export const fbAuth = getAuth(fbApp)
export const fbDb = getFirestore(fbApp)
export const gProvider = new GoogleAuthProvider()

export {
  signInWithPopup, fbSignOut, onAuthStateChanged,
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, onSnapshot, serverTimestamp, query, where,
}
