// Firebase Configuration
// IMPORTANT: Replace these values with your actual Firebase config
// Get your config from: Firebase Console > Project Settings > Your apps > Web app
// 
// Configuration Priority:
// 1. Environment variables (VITE_* for Vite, process.env for Node.js)
// 2. Fallback to hardcoded values (for direct HTML/JS usage)
//
// For production, use environment variables or a secure config service
// Never commit actual credentials to version control

// Guard against duplicate declarations
if (typeof firebaseConfig === 'undefined') {
    // Try to get from environment variables (works with build tools)
    // Note: For direct HTML/JS usage, this will use fallback values
    // For build tools (Vite, Webpack), environment variables are injected at build time
    const getEnvVar = (key, fallback) => {
        // Check for window-level environment (if set by build tool or injected)
        if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
            return window.__ENV__[key];
        }
        // Check for Node.js environment variables (server-side only)
        if (typeof process !== 'undefined' && process.env && process.env[key]) {
            return process.env[key];
        }
        // For client-side direct usage, return fallback
        // Build tools will replace these at build time if configured
        return fallback;
    };
    
    var firebaseConfig = {
        apiKey: getEnvVar('VITE_FIREBASE_API_KEY', "AIzaSyCe-asXYBrIwlaL1V4-WaX598R1H9B_E_Y"),
        authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', "vss2025-a8b47.firebaseapp.com"),
        projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', "vss2025-a8b47"),
        storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', "vss2025-a8b47.firebasestorage.app"),
        messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', "145421955139"),
        appId: getEnvVar('VITE_FIREBASE_APP_ID', "1:145421955139:web:982246aec184de7f3264f6"),
        measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID', "G-FQ9MSQ4890")
    };
}

// Initialize Firebase with retry logic
function initializeFirebase() {
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        // Retry after a short delay
        setTimeout(initializeFirebase, 100);
        return;
    }

    try {
        // Check if Firebase is already initialized
        if (firebase.apps && firebase.apps.length > 0) {
            // Set global flag if it exists
            if (typeof window !== 'undefined') {
                window.firebaseInitialized = true;
            }
            return;
        }

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        
        // Set auth persistence to LOCAL (default, but explicit for reliability)
        if (firebase.auth && firebase.auth().setPersistence) {
            firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
                .catch((error) => {
                    console.warn('Error setting auth persistence:', error);
                });
        }
        
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

