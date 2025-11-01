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

// Initialize Firebase with retry logic
function initializeFirebase() {
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not yet loaded, retrying...');
        // Retry after a short delay
        setTimeout(initializeFirebase, 100);
        return;
    }

    try {
        // Check if Firebase is already initialized
        if (firebase.apps && firebase.apps.length > 0) {
            console.log('Firebase already initialized');
            // Set global flag if it exists
            if (typeof window !== 'undefined') {
                window.firebaseInitialized = true;
            }
            return;
        }

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');
        // Set global flags
        if (typeof window !== 'undefined') {
            window.firebaseInitialized = true;
            // Also update the script.js flag if it exists in global scope
            try {
                if (typeof firebaseInitialized !== 'undefined') {
                    firebaseInitialized = true;
                }
            } catch (e) {
                // Variable might not be in scope yet, that's okay
            }
        }
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        // Retry initialization if there was an error
        if (error.code !== 'app/duplicate-app') {
            setTimeout(initializeFirebase, 500);
        }
    }
}

// Initialize Firebase - start immediately, retry logic handles SDK loading
// Since scripts load at bottom of body, give SDKs a moment to load
setTimeout(function() {
    initializeFirebase();
}, 50);

// Also try on DOM ready as backup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Double-check initialization after DOM is ready
        setTimeout(function() {
            if (!window.firebase || !window.firebase.apps || window.firebase.apps.length === 0) {
                initializeFirebase();
            }
        }, 100);
    });
}

