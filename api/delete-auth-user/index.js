// Vercel serverless function to delete Firebase Auth users
// Environment variables required:
// - FIREBASE_SERVICE_ACCOUNT (JSON string of service account key)
// OR individual fields:
// - FIREBASE_PROJECT_ID
// - FIREBASE_CLIENT_EMAIL
// - FIREBASE_PRIVATE_KEY

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
    try {
        // Try to use full service account JSON first
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            // Fall back to individual environment variables
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                })
            });
        }
        console.log('Firebase Admin initialized successfully');
    } catch (error) {
        console.error('Error initializing Firebase Admin:', error);
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, adminToken } = req.body;

        // Validate request
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Verify the admin token (optional but recommended)
        if (adminToken) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(adminToken);
                console.log('Request from admin user:', decodedToken.uid);
            } catch (tokenError) {
                console.warn('Token verification failed:', tokenError.message);
                // Continue anyway for now, but you could return 401 here
            }
        }

        try {
            // Get user by email
            const userRecord = await admin.auth().getUserByEmail(email);
            const uid = userRecord.uid;
            
            // Delete the user
            await admin.auth().deleteUser(uid);
            
            console.log(`Deleted Auth user: ${email} (${uid})`);
            
            return res.status(200).json({
                success: true,
                message: `User ${email} deleted from Firebase Auth`,
                uid: uid
            });
            
        } catch (userError) {
            if (userError.code === 'auth/user-not-found') {
                return res.status(404).json({
                    success: false,
                    error: 'User not found in Firebase Auth',
                    message: `No Auth account exists for ${email}`
                });
            }
            
            console.error('Error deleting user:', userError);
            return res.status(500).json({
                success: false,
                error: userError.message || 'Failed to delete user'
            });
        }

    } catch (error) {
        console.error('Error in delete-auth-user:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};

