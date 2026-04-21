// js/firebase-config.js

// 1. Import Functions (CDN se - Browser Friendly - No Install Needed)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. Aapka PERSONAL CONFIG (Maine aapke data se bhar diya hai)
const firebaseConfig = {
  apiKey: "AIzaSyDBLHApM4cO-GBB0Z7heXYvRZZePgEi4p8",
  authDomain: "uttam-a5eb4.firebaseapp.com",
  projectId: "uttam-a5eb4",
  storageBucket: "uttam-a5eb4.firebasestorage.app",
  messagingSenderId: "589431225015",
  appId: "1:589431225015:web:3b526d81a02ae3265a6b32",
  measurementId: "G-G512PRF3RD"
};

// 3. Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// 4. Export tools
export { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, doc, setDoc, getDoc, onSnapshot, collection, addDoc, updateDoc };
