// Script to import Excel data to Firebase
// Run with: node import-excel-to-firebase.js
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
const excelFilePath = process.env.EXCEL_FILE_PATH || 'TestData.xlsx';
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
                // Include all other fields from Excel
                ...row,
                importedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Use Praveshika ID as document ID in registrations collection
            // Firestore document IDs can contain "/" but ensure it's a proper string
            console.log(`Creating document with ID: "${praveshikaIdString}" (normalized: ${normalizedPraveshikaId})`);
            await db.collection('registrations').doc(praveshikaIdString).set(registrationData);
            console.log(`✓ Imported: ${praveshikaId} - ${name || 'N/A'}`);
            successCount++;

        } catch (error) {
            console.error(`✗ Error importing row:`, error.message);
            errorCount++;
        }
    }

    console.log(`\nImport completed!`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
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

