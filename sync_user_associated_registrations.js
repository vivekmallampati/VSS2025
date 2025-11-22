// Script to sync associatedRegistrations in users collection based on emailToUids
// Run with: node sync_user_associated_registrations.js
// Requires: npm install firebase-admin

const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';

let serviceAccount;
try {
    serviceAccount = require(serviceAccountPath);
} catch (err) {
    try {
        serviceAccount = require('/app/secrets/serviceAccountKey.json');
    } catch (err2) {
        console.error('Error: Service account key not found.');
        console.error(`Tried paths: ${serviceAccountPath} and /app/secrets/serviceAccountKey.json`);
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function syncUserAssociatedRegistrations() {
    console.log('Fetching emailToUids collection...');
    const emailToUidsSnapshot = await db.collection('emailToUids').get();
    console.log(`Found ${emailToUidsSnapshot.size} email mappings`);

    let totalUsersUpdated = 0;
    let totalUsersSkipped = 0;
    let totalErrors = 0;
    let processedEmails = 0;

    // Process each email mapping
    for (const emailDoc of emailToUidsSnapshot.docs) {
        const normalizedEmail = emailDoc.id;
        const emailData = emailDoc.data();
        const praveshikaIds = emailData.uids || [];

        if (praveshikaIds.length === 0) {
            continue;
        }

        processedEmails++;
        if (processedEmails % 100 === 0) {
            console.log(`Processing email ${processedEmails}/${emailToUidsSnapshot.size}...`);
        }

        // Find all users with this email (normalized)
        try {
            // First try direct query (emails should be normalized in users collection)
            let usersSnapshot = await db.collection('users')
                .where('email', '==', normalizedEmail)
                .get();

            const matchingUsers = [];
            usersSnapshot.forEach(userDoc => {
                matchingUsers.push({ uid: userDoc.id, data: userDoc.data() });
            });

            // If no matches found, also check case-insensitive (in case some emails aren't normalized)
            if (matchingUsers.length === 0) {
                const allUsersSnapshot = await db.collection('users').get();
                allUsersSnapshot.forEach(userDoc => {
                    const userData = userDoc.data();
                    const userEmail = userData.email || '';
                    const userNormalizedEmail = userEmail.toLowerCase().trim();
                    
                    if (userNormalizedEmail === normalizedEmail) {
                        matchingUsers.push({ uid: userDoc.id, data: userData });
                    }
                });
            }

            if (matchingUsers.length === 0) {
                continue;
            }

            // Fetch registration details for all Praveshika IDs
            const registrationPromises = praveshikaIds.map(async (praveshikaId) => {
                try {
                    const regDoc = await db.collection('registrations').doc(praveshikaId).get();
                    if (regDoc.exists) {
                        const regData = regDoc.data();
                        return {
                            uniqueId: regData.uniqueId || praveshikaId,
                            name: regData.name || regData['Full Name'] || '',
                            email: regData.email || regData['Email address'] || normalizedEmail
                        };
                    } else {
                        // Registration doesn't exist, create minimal entry
                        return {
                            uniqueId: praveshikaId,
                            name: '',
                            email: normalizedEmail
                        };
                    }
                } catch (error) {
                    console.error(`Error fetching registration for ${praveshikaId}:`, error.message);
                    return {
                        uniqueId: praveshikaId,
                        name: '',
                        email: normalizedEmail
                    };
                }
            });

            const associatedRegistrations = await Promise.all(registrationPromises);
            
            // Remove duplicates and null entries
            const validRegistrations = associatedRegistrations
                .filter(reg => reg !== null && reg.uniqueId)
                .filter((reg, index, self) => 
                    index === self.findIndex(r => r.uniqueId === reg.uniqueId)
                );

            // Update each matching user
            for (const { uid, data: userData } of matchingUsers) {
                try {
                    // Check if update is needed
                    const currentAssociatedRegs = userData.associatedRegistrations || [];
                    const currentUniqueIds = currentAssociatedRegs.map(reg => reg.uniqueId).filter(Boolean);
                    const newUniqueIds = validRegistrations.map(reg => reg.uniqueId).filter(Boolean);
                    
                    // Check if there are differences
                    const hasNewIds = newUniqueIds.some(uid => !currentUniqueIds.includes(uid));
                    const hasRemovedIds = currentUniqueIds.some(uid => !newUniqueIds.includes(uid));
                    
                    if (hasNewIds || hasRemovedIds || currentUniqueIds.length !== newUniqueIds.length) {
                        await db.collection('users').doc(uid).update({
                            associatedRegistrations: validRegistrations,
                            emailProcessedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        totalUsersUpdated++;
                        console.log(`✓ Updated user ${uid} (${normalizedEmail}) with ${validRegistrations.length} associated registrations`);
                    } else {
                        totalUsersSkipped++;
                    }
                } catch (error) {
                    console.error(`✗ Error updating user ${uid} (${normalizedEmail}):`, error.message);
                    totalErrors++;
                }
            }
        } catch (error) {
            console.error(`✗ Error processing email ${normalizedEmail}:`, error.message);
            totalErrors++;
        }
    }

    console.log('\nSync complete!');
    console.log(`Emails processed: ${processedEmails}`);
    console.log(`Users updated: ${totalUsersUpdated}`);
    console.log(`Users skipped (no changes): ${totalUsersSkipped}`);
    console.log(`Errors: ${totalErrors}`);
}

syncUserAssociatedRegistrations()
    .then(() => {
        console.log('User associated registrations sync finished successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error while syncing user associated registrations:', error);
        process.exit(1);
    });

