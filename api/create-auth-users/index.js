// Vercel serverless function to create Firebase Auth users
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
        const { users, adminToken } = req.body;

        // Validate request
        if (!users || !Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ error: 'Invalid request: users array required' });
        }

        // Verify the admin token (optional but recommended)
        if (adminToken) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(adminToken);
                console.log('Request from user:', decodedToken.uid);
            } catch (tokenError) {
                console.warn('Token verification failed:', tokenError.message);
                // Continue anyway for now, but you could return 401 here
            }
        }

        const results = [];
        const defaultPassword = 'Vss@2025';

        for (const user of users) {
            const { email, name, uniqueId } = user;

            if (!email || !uniqueId) {
                results.push({
                    uniqueId: uniqueId || 'unknown',
                    success: false,
                    error: 'Missing email or uniqueId'
                });
                continue;
            }

            try {
                // Check if user already exists
                let existingUser = null;
                try {
                    existingUser = await admin.auth().getUserByEmail(email);
                } catch (e) {
                    // User doesn't exist, which is what we want
                }

                if (existingUser) {
                    results.push({
                        uniqueId,
                        success: false,
                        error: 'User with this email already exists',
                        uid: existingUser.uid
                    });
                    continue;
                }

                // Create the user in Firebase Auth
                const userRecord = await admin.auth().createUser({
                    email: email,
                    password: defaultPassword,
                    displayName: name || uniqueId,
                    disabled: false
                });

                console.log(`Created auth user: ${email} (${userRecord.uid})`);

                results.push({
                    uniqueId,
                    success: true,
                    uid: userRecord.uid,
                    email: email
                });

            } catch (userError) {
                console.error(`Error creating user ${email}:`, userError.message);
                results.push({
                    uniqueId,
                    success: false,
                    error: userError.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        return res.status(200).json({
            success: true,
            message: `Created ${successCount} users, ${failCount} failed`,
            results
        });

    } catch (error) {
        console.error('Error in create-auth-users:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};

