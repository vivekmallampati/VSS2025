/**
 * Helper script to set a user as superadmin
 * 
 * Usage:
 *   node set-superadmin.js <user-email>
 * 
 * This script will find the user by email in Firebase Authentication
 * and update their Firestore user document to add role: 'superadmin'
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK with service account
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function setSuperadmin(email) {
    try {
        console.log(`Looking up user with email: ${email}`);
        
        // Get user by email from Firebase Authentication
        const userRecord = await auth.getUserByEmail(email);
        const uid = userRecord.uid;
        
        console.log(`Found user with UID: ${uid}`);
        
        // Update user document in Firestore
        await db.collection('users').doc(uid).update({
            role: 'superadmin',
            roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✓ Successfully set ${email} as superadmin!`);
        console.log(`User must log out and log back in for changes to take effect.`);
        
    } catch (error) {
        console.error('Error setting superadmin:', error.message);
        
        if (error.code === 'auth/user-not-found') {
            console.error(`No user found with email: ${email}`);
            console.error('Make sure the user has registered an account first.');
        } else if (error.code === 'permission-denied') {
            console.error('Permission denied. Check Firestore security rules.');
        }
        
        process.exit(1);
    }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
    console.error('Usage: node set-superadmin.js <user-email>');
    console.error('Example: node set-superadmin.js admin@example.com');
    process.exit(1);
}

// Run the function
setSuperadmin(email).then(() => {
    console.log('Done!');
    process.exit(0);
});

