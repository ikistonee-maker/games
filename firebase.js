// Firebase v10 Modular SDK - Configuration & Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⚠️ GANTI DENGAN KONFIGURASI FIREBASE ANDA
// Dapatkan dari: Firebase Console > Project Settings > Your apps > Web app
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDM5z0dKZJPM81YpVuJzTBJ21kWnWAJFRM",
    authDomain: "gamestictactoe.firebaseapp.com",
    projectId: "gamestictactoe",
    storageBucket: "gamestictactoe.firebasestorage.app",
    messagingSenderId: "504479121510",
    appId: "1:504479121510:web:9c21667d1b2c5e3b1f6da7",
    measurementId: "G-HH4N3SGYQ1"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
// Development only: uncomment jika pakai emulator
// connectFirestoreEmulator(db, 'localhost', 8080);

export { app, db };
