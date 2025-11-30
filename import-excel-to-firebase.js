// Script to import Excel data to Firebase or export Firebase collections to Excel
// Run with: 
//   Import: node import-excel-to-firebase.js
//   Export: node import-excel-to-firebase.js --export contactMessages emailToUids
// Requires: npm install xlsx firebase-admin

const XLSX = require('xlsx');
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
// IMPORTANT: Download your service account key from Firebase Console > Project Settings > Service Accounts
// and place it in the project root as 'serviceAccountKey.json'
// Or set GOOGLE_APPLICATION_CREDENTIALS environment variable
// For Docker: mount the key as a volume or use the path /app/secrets/serviceAccountKey.json

let serviceAccount;
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';

try {
    serviceAccount = require(serviceAccountPath);
} catch (e) {
    // Try Docker path
    try {
        serviceAccount = require('/app/secrets/serviceAccountKey.json');
    } catch (e2) {
        console.error('Error: Service account key not found.');
        console.error(`Tried paths: ${serviceAccountPath} and /app/secrets/serviceAccountKey.json`);
        console.error('Please provide the service account key file.');
        console.error('For Docker: mount it as a volume or set SERVICE_ACCOUNT_PATH environment variable.');
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Read Excel file - support custom path via environment variable
const excelFilePath = process.env.EXCEL_FILE_PATH || 'dataprocessing/Registrations_11_29.xlsx';
let workbook;
try {
    workbook = XLSX.readFile(excelFilePath);
} catch (e) {
    console.error(`Error: Excel file not found at ${excelFilePath}`);
    console.error('Set EXCEL_FILE_PATH environment variable to specify a different path.');
    process.exit(1);
}
const sheetName = workbook.SheetNames[0]; // Get first sheet
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(`Found ${data.length} records in Excel file`);

// Import data to Firebase
async function importData() {
    let successCount = 0;
    let errorCount = 0;
    // Map to track email -> array of UIDs
    const emailToUidsMap = new Map();

    for (const row of data) {
        try {
            // Map Excel columns to Firebase fields
            // Handle various possible column name formats
            const praveshikaId = row['Praveshika ID'] || row['Praveshika_ID'] || row['Unique ID'] || row['UniqueID'];
            const name = row['Full Name'] || row['Name'] || row['name'] || row['full name'] || '';
            const email = row['Email address'] || row['Email'] || row['email'] || row['email address'] || '';
            const country = row['Country of Current Residence'] || row['Country'] || row['country'] || '';
            const shreni = row['Corrected Shreni'] || row['Default Shreni'] || row['Shreni'] || row['shreni'] || '';
            const barcode = row['BarCode'] || row['Barcode'] || row['barcode'] || praveshikaId;
            
            if (!praveshikaId) {
                console.warn('Skipping row: Missing Praveshika ID');
                errorCount++;
                continue;
            }

            // Normalize Praveshika ID for case-insensitive matching (lowercase, remove "/" and "-")
            const normalizedPraveshikaId = praveshikaId.toLowerCase().replace(/[/-]/g, '');
            
            // Ensure praveshikaId is a string (Firestore document IDs must be strings)
            const praveshikaIdString = String(praveshikaId).trim();

            // Track email -> UID mapping (only if email exists)
            if (email && email.trim()) {
                const normalizedEmail = email.toLowerCase().trim();
                if (!emailToUidsMap.has(normalizedEmail)) {
                    emailToUidsMap.set(normalizedEmail, []);
                }
                // Add UID to the array if not already present (avoid duplicates)
                const existingUids = emailToUidsMap.get(normalizedEmail);
                if (!existingUids.includes(praveshikaIdString)) {
                    existingUids.push(praveshikaIdString);
                }
            }

            // Map "Place of Departure Train/Flight" to "departurePlace"
            const departurePlace = row['Place of Departure Train/Flight'] || row['Place of Departure'] || row['departurePlace'] || '';
            
            // Create registration document with normalized field names
            const registrationData = {
                uniqueId: praveshikaIdString,
                normalizedId: normalizedPraveshikaId, // Store normalized version for easy lookup
                name: name,
                email: email,
                country: country,
                Country: country, // Keep original column name too
                shreni: shreni,
                Shreni: shreni, // Keep original column name too
                barcode: barcode,
                Barcode: barcode, // Keep original column name too
                departurePlace: departurePlace, // Map "Place of Departure Train/Flight" to "departurePlace"
                // Include all other fields from Excel
                ...row,
                importedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Use Praveshika ID as document ID in registrations collection
            // Firestore document IDs can contain "/" but ensure it's a proper string
            await db.collection('registrations').doc(praveshikaIdString).set(registrationData);
            console.log(`✓ Imported: ${praveshikaId} - ${name || 'N/A'}`);
            successCount++;

        } catch (error) {
            console.error(`✗ Error importing row:`, error.message);
            errorCount++;
        }
    }

    // Write email -> UIDs mappings to Firebase (merge with existing mappings)
    console.log(`\nUpdating email to UIDs mappings (merging with existing)...`);
    let emailMappingCount = 0;
    let emailMappingErrors = 0;

    for (const [normalizedEmail, newUids] of emailToUidsMap.entries()) {
        try {
            // Get existing emailToUids document if it exists
            const existingDoc = await db.collection('emailToUids').doc(normalizedEmail).get();
            let allUids = [...newUids];
            
            if (existingDoc.exists) {
                const existingData = existingDoc.data();
                const existingUids = existingData.uids || [];
                // Merge UIDs, removing duplicates
                allUids = [...new Set([...existingUids, ...newUids])].sort();
                console.log(`  Merging ${normalizedEmail}: ${existingUids.length} existing + ${newUids.length} new = ${allUids.length} total`);
            }
            
            await db.collection('emailToUids').doc(normalizedEmail).set({
                email: normalizedEmail,
                uids: allUids,
                count: allUids.length,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            emailMappingCount++;
        } catch (error) {
            console.error(`✗ Error updating email mapping for ${normalizedEmail}:`, error.message);
            emailMappingErrors++;
        }
    }
    
    // After import, sync all emailToUids from all registrations to ensure completeness
    console.log(`\nSyncing all emailToUids from all registrations to ensure completeness...`);
    const allRegistrationsSnapshot = await db.collection('registrations').get();
    const allEmailMap = new Map();
    
    allRegistrationsSnapshot.forEach((doc) => {
        const data = doc.data() || {};
        const emailRaw = data.email || data['Email address'] || data['Email'] || data['email address'] || '';
        const uniqueIdRaw = data.uniqueId || data['Praveshika ID'] || data['Unique ID'] || doc.id;
        
        if (emailRaw && uniqueIdRaw) {
            const normalizedEmail = emailRaw.toLowerCase().trim();
            const uniqueId = String(uniqueIdRaw).trim();
            
            if (normalizedEmail && uniqueId) {
                if (!allEmailMap.has(normalizedEmail)) {
                    allEmailMap.set(normalizedEmail, new Set());
                }
                allEmailMap.get(normalizedEmail).add(uniqueId);
            }
        }
    });
    
    let syncCount = 0;
    let syncErrors = 0;
    for (const [normalizedEmail, uidSet] of allEmailMap.entries()) {
        const uids = Array.from(uidSet).sort();
        try {
            await db.collection('emailToUids').doc(normalizedEmail).set({
                email: normalizedEmail,
                uids: uids,
                count: uids.length,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            syncCount++;
        } catch (error) {
            console.error(`✗ Error syncing email mapping for ${normalizedEmail}:`, error.message);
            syncErrors++;
        }
    }
    
    console.log(`Synced ${syncCount} email mappings from all registrations`);

    console.log(`\nImport completed!`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Email mappings created: ${emailMappingCount}`);
    console.log(`Email mapping errors: ${emailMappingErrors}`);
}

// Run import
importData()
    .then(() => {
        console.log('Import process finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });

