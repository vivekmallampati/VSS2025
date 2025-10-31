// Firebase Configuration
// IMPORTANT: Replace these values with your actual Firebase config
// Get your config from: Firebase Console > Project Settings > Your apps > Web app

const firebaseConfig = {
    apiKey: "AIzaSyCe-asXYBrIwlaL1V4-WaX598R1H9B_E_Y",
    authDomain: "vss2025-a8b47.firebaseapp.com",
    projectId: "vss2025-a8b47",
    storageBucket: "vss2025-a8b47.firebasestorage.app",
    messagingSenderId: "145421955139",
    appId: "1:145421955139:web:982246aec184de7f3264f6",
    measurementId: "G-FQ9MSQ4890"
  };

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');
    }
} else {
    console.error('Firebase SDK not loaded. Check script tags in index.html');
}

