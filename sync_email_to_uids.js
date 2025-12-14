// Script to rebuild the emailToUids collection from existing registrations
// Run with: node sync_email_to_uids.js
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

function extractEmail(data) {
    return (
        data?.email ||
        data?.Email ||
        data?.emailAddress ||
        data?.['email address'] ||
        data?.['Email address'] ||
        data?.['Email Address'] ||
        data?.['Email address '] ||
        data?.['Email Address '] ||
        ''
    );
}

function extractUniqueId(data, fallbackId) {
    return (
        data?.uniqueId ||
        data?.UniqueId ||
        data?.uniqueID ||
        data?.UniqueID ||
        data?.['Praveshika ID'] ||
        data?.PraveshikaId ||
        data?.PraveshikaID ||
        data?.praveshikaId ||
        data?.['Unique ID'] ||
        data?.['UniqueID'] ||
        data?.['Praveshika_ID'] ||
        data?.normalizedId ||
        fallbackId
    );
}

async function syncEmailToUids() {
    console.log('Fetching registrations collection (only approved shibirarthis)...');
    const snapshot = await db.collection('registrations').get();
    console.log(`Fetched ${snapshot.size} registrations (only approved remain after migration)`);

    const emailMap = new Map();
    let registrationsWithoutEmail = 0;

    snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const emailRaw = extractEmail(data);
        const uniqueIdRaw = extractUniqueId(data, doc.id);

        if (!emailRaw || !uniqueIdRaw) {
            if (!emailRaw) {
                registrationsWithoutEmail++;
            }
            return;
        }

        const normalizedEmail = emailRaw.toLowerCase().trim();
        const uniqueId = String(uniqueIdRaw).trim();
        if (!normalizedEmail || !uniqueId) {
            return;
        }

        if (!emailMap.has(normalizedEmail)) {
            emailMap.set(normalizedEmail, new Set());
        }
        emailMap.get(normalizedEmail).add(uniqueId);
    });

    console.log(`Found ${emailMap.size} unique emails`);
    if (registrationsWithoutEmail > 0) {
        console.warn(`Skipped ${registrationsWithoutEmail} registrations without an email`);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const [normalizedEmail, uidSet] of emailMap.entries()) {
        const uids = Array.from(uidSet).sort();
        try {
            await db.collection('emailToUids').doc(normalizedEmail).set({
                email: normalizedEmail,
                uids,
                count: uids.length,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            successCount++;
            if (successCount % 200 === 0) {
                console.log(`Processed ${successCount} email mappings so far...`);
            }
        } catch (error) {
            console.error(`Error updating ${normalizedEmail}:`, error.message);
            errorCount++;
        }
    }

    console.log('\nSync complete');
    console.log(`Email mappings written: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
}

syncEmailToUids()
    .then(() => {
        console.log('Email to UIDs sync finished successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error while syncing emailToUids:', error);
        process.exit(1);
    });

