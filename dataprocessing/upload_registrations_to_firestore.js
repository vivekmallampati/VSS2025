// Script to import Registrations.xlsx to Firestore with normalized SQL-like structure
// Run with: node dataprocessing/upload_registrations_to_firestore.js
// Requires: npm install xlsx firebase-admin
// Set EXCEL_FILE_PATH environment variable to specify Excel file path

const XLSX = require('xlsx');
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
let serviceAccount;
// Default paths: Docker uses /app/secrets, local uses project root
const defaultServiceAccountPath = process.platform === 'linux' && process.env.NODE_ENV === 'production' 
    ? '/app/secrets/serviceAccountKey.json' 
    : path.join(__dirname, '../serviceAccountKey.json');
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH || defaultServiceAccountPath;

try {
    serviceAccount = require(serviceAccountPath);
} catch (e) {
    // Try alternative paths
    const altPath = serviceAccountPath.includes('/app/') 
        ? path.join(__dirname, '../serviceAccountKey.json')
        : '/app/secrets/serviceAccountKey.json';
    try {
        serviceAccount = require(altPath);
        console.log(`Using alternative service account path: ${altPath}`);
    } catch (e2) {
        console.error('Error: Service account key not found.');
        console.error(`Tried paths: ${serviceAccountPath} and ${altPath}`);
        console.error('Please provide the service account key file.');
        console.error('For Docker: mount it as a volume or set SERVICE_ACCOUNT_PATH environment variable.');
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Read Excel file
// In Docker, file is at /app/Registrations.xlsx (copied during build)
// Locally, it's in the dataprocessing directory
const defaultExcelPath = process.platform === 'linux' && process.env.NODE_ENV === 'production'
    ? '/app/Registrations.xlsx'
    : path.join(__dirname, 'Registrations.xlsx');
const excelFilePath = process.env.EXCEL_FILE_PATH || defaultExcelPath;
let workbook;
try {
    workbook = XLSX.readFile(excelFilePath);
} catch (e) {
    console.error(`Error: Excel file not found at ${excelFilePath}`);
    console.error('Set EXCEL_FILE_PATH environment variable to specify a different path.');
    process.exit(1);
}

const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('registration')) || workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(`Found ${data.length} records in Excel file`);
console.log(`Using sheet: ${sheetName}`);

// Helper function to normalize field value
function normalizeValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
}

// Helper function to convert Excel serial date to date string (MM/DD/YYYY)
function convertExcelDate(excelDate) {
    if (!excelDate) return '';
    
    const str = String(excelDate).trim();
    if (!str) return '';
    
    // If it's already a date string (contains / or -), return as is
    if (str.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) {
        return str;
    }
    
    // Try to parse as number (Excel serial date)
    const num = parseFloat(str);
    if (isNaN(num) || num <= 0 || num > 1000000) {
        // Not a valid Excel serial date number, return original
        return str;
    }
    
    // Excel serial date conversion
    // Excel epoch: Serial 1 = January 1, 1900
    // Excel incorrectly treats 1900 as a leap year (it wasn't), so we need to adjust
    // The most reliable conversion accounts for this bug
    const serial = Math.floor(num);
    
    // Standard conversion: Excel serial to JavaScript Date
    // Excel serial 1 = Jan 1, 1900
    // But Excel counts Feb 29, 1900 (which didn't exist), so dates after Feb 28, 1900 are off by 1
    // For dates in 2025 (serial ~46000+), we can use: date = Jan 1, 1900 + (serial - 1) days
    // But we need to subtract 1 more day to account for the leap year bug
    const baseDate = new Date(1900, 0, 1); // January 1, 1900
    const daysSince1900 = serial - 1; // Serial 1 = day 0
    const date = new Date(baseDate);
    date.setDate(date.getDate() + daysSince1900 - 1); // Subtract 1 to account for Excel's leap year bug
    
    // Verify it's a reasonable date (between 1900 and 2100)
    if (date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
        // Format as MM/DD/YYYY
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }
    
    // If conversion failed, return original string
    return str;
}

// Helper function to check if transportation data exists
function hasTransportationData(row) {
    return !!(normalizeValue(row['Date of Arrival']) || 
              normalizeValue(row['Time of Arrival']) || 
              normalizeValue(row['Place of Arrival']) ||
              normalizeValue(row['Date of Departure Train/Flight']) ||
              normalizeValue(row['Time of Departure Train/Flight']) ||
              normalizeValue(row['Place of Departure Train/Flight']));
}

// Helper function to check if tour data exists
function hasTourData(row) {
    return !!normalizeValue(row['Please select a post shibir tour option']);
}

// Import data to Firebase
async function importData() {
    let successCount = 0;
    let errorCount = 0;
    const emailToUidsMap = new Map();
    const now = admin.firestore.Timestamp.now();

    for (const row of data) {
        try {
            // Get Praveshika ID (required)
            const praveshikaId = normalizeValue(row['Praveshika ID']);
            if (!praveshikaId) {
                console.warn('Skipping row: Missing Praveshika ID');
                errorCount++;
                continue;
            }

            const praveshikaIdString = String(praveshikaId).trim();
            const normalizedId = praveshikaIdString.toLowerCase().replace(/[/-]/g, '');

            // Track email -> UID mapping
            const email = normalizeValue(row['Email address']);
            if (email) {
                const normalizedEmail = email.toLowerCase().trim();
                if (!emailToUidsMap.has(normalizedEmail)) {
                    emailToUidsMap.set(normalizedEmail, []);
                }
                const existingUids = emailToUidsMap.get(normalizedEmail);
                if (!existingUids.includes(praveshikaIdString)) {
                    existingUids.push(praveshikaIdString);
                }
            }

            // Map Excel columns to normalized fields
            const registrationData = {
                // Core fields
                uniqueId: praveshikaIdString,
                normalizedId: normalizedId,
                name: normalizeValue(row['Full Name']),
                email: email,
                country: normalizeValue(row['Country of Current Residence']),
                shreni: normalizeValue(row['Corrected Shreni']) || normalizeValue(row['Default Shreni']),
                barcode: normalizeValue(row['BarCode']) || praveshikaIdString,
                
                // Profile fields
                phone: normalizeValue(row['Phone number on which you can be contacted in Bharat (by call or WhatsApp)']),
                whatsapp: normalizeValue(row['Whatsapp Number']),
                city: normalizeValue(row['City of Current Residence']),
                gender: normalizeValue(row['Gender']),
                age: normalizeValue(row['Age']),
                occupation: normalizeValue(row['Occupation (e.g. Engineer/Business/Homemaker/Student)']),
                educationalQual: normalizeValue(row['Educational Qualification']),
                zone: normalizeValue(row['Zone']) || normalizeValue(row['Zone/Shreni']),
                
                // Emergency contact
                emergencyContactName: normalizeValue(row['Emergency Contact Name']),
                emergencyContactNumber: normalizeValue(row['Emergency Contact Number']),
                emergencyContactRelation: normalizeValue(row['Relationship of Emergency Contact Person']),
                
                // Sangh info
                sanghYears: normalizeValue(row['Associated with sangh for how many years/months']),
                shikshaVarg: normalizeValue(row['Which Sangh Shiksha Varg have you completed']),
                hssResponsibility: normalizeValue(row['Do you have any responsibility in Hindu Swayamsevak Sangh?']),
                currentResponsibility: normalizeValue(row['What is your current responsibility in HSS or other organisation?']),
                otherOrgResponsibility: normalizeValue(row['Do you have any responsibility in any other organisation (e.g. VHP, Sewa International etc)?']),
                
                // Medical/Dietary
                medicalCondition: normalizeValue(row['Any Pre-existing Medical Condition']),
                dietaryRestrictions: normalizeValue(row['Any Dietary Restrictions']),
                otherDetails: normalizeValue(row['Any Other Details']),
                
                // Transportation - Arrival
                arrivalDate: convertExcelDate(row['Date of Arrival']),
                arrivalTime: normalizeValue(row['Time of Arrival']),
                arrivalPlace: normalizeValue(row['Place of Arrival']),
                arrivalFlightTrain: normalizeValue(row['Arrival Flight/Train Number']),
                pickupNeeded: normalizeValue(row['Do you need a pickup on arrival?']),
                
                // Transportation - Departure
                departureDate: convertExcelDate(row['Date of Departure Train/Flight']),
                departureTime: normalizeValue(row['Time of Departure Train/Flight']),
                departurePlace: normalizeValue(row['Place of Departure Train/Flight']),
                departureFlightTrain: normalizeValue(row['Departure Flight/Train Number']),
                dropoffNeeded: normalizeValue(row['Do you need a drop off for departure?']),
                
                // Tour
                postShibirTour: normalizeValue(row['Please select a post shibir tour option']),
                
                // Metadata
                status: normalizeValue(row['Status']),
                seqNum: normalizeValue(row['SeqNum']),
                ganveshSize: normalizeValue(row['Ganvesh Kurta Shoulder Size in cm (for swayamevaks and sevikas)']),
                
                // Timestamps
                createdAt: now,
                updatedAt: now,
                travelupdateAt: hasTransportationData(row) ? now : null,
                tourupdateAt: hasTourData(row) ? now : null
            };

            // Upload to Firestore
            await db.collection('registrations').doc(praveshikaIdString).set(registrationData);
            console.log(`✓ Imported: ${praveshikaIdString} - ${registrationData.name || 'N/A'}`);
            successCount++;

        } catch (error) {
            console.error(`✗ Error importing row:`, error.message);
            errorCount++;
        }
    }

    // Write email -> UIDs mappings to Firebase
    console.log(`\nCreating email to UIDs mappings...`);
    let emailMappingCount = 0;
    let emailMappingErrors = 0;

    for (const [normalizedEmail, uids] of emailToUidsMap.entries()) {
        try {
            await db.collection('emailToUids').doc(normalizedEmail).set({
                email: normalizedEmail,
                uids: uids,
                count: uids.length,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            emailMappingCount++;
        } catch (error) {
            console.error(`✗ Error creating email mapping for ${normalizedEmail}:`, error.message);
            emailMappingErrors++;
        }
    }

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

