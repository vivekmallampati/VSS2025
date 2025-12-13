// firestore-utils.js
// Unified script for Firestore operations: import, normalize, cleanup, and find issues
// Run with: node firestore-utils.js <command>
// Commands: import, normalize, cleanup, find-negative-phones
// For Docker: docker compose run --rm <service-name>

const XLSX = require('xlsx');
const admin = require('firebase-admin');

// ============================================================================
// SHARED INITIALIZATION
// ============================================================================

let serviceAccount;
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';

try {
    serviceAccount = require(serviceAccountPath);
} catch (e) {
    try {
        serviceAccount = require('/app/secrets/serviceAccountKey.json');
    } catch (e2) {
        console.error('Error: Service account key not found.');
        console.error(`Tried paths: ${serviceAccountPath} and /app/secrets/serviceAccountKey.json`);
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================================================
// SHARED CONSTANTS AND UTILITIES
// ============================================================================

const systemFields = ['uniqueId', 'normalizedId', 'importedAt', 'createdAt', 'createdBy', 'updatedAt', 'tourupdateAt', 'travelupdateAt'];

const fieldNameMapping = {
    'Age': 'age',
    'Any Dietary Restrictions': 'dietaryRestrictions',
    'Any Other Details': 'otherDetails',
    'Any Pre-existing Medical Condition': 'medicalCondition',
    'Arrival Flight/Train Number': 'arrivalFlightTrain',
    'Associated with sangh for how many years/months': 'sanghYears',
    'BarCode': 'barcode',
    'Barcode': 'barcode',
    'City of Current Residence': 'city',
    'Country': 'country',
    'Country of Current Residence': 'country',
    'Date of Arrival': 'arrivalDate',
    'Date of Departure Train/Flight': 'departureDate',
    'Departure Flight/Train Number': 'departureFlightTrain',
    'Do you have any responsibility in Hindu Swayamsevak Sangh?': 'hssResponsibility',
    'Do you have any responsibility in any other organisation (e.g. VHP, Sewa International etc)?': 'otherOrgResponsibility',
    'Do you need a drop off for departure?': 'dropoffNeeded',
    'Do you need a pickup on arrival?': 'pickupNeeded',
    'Educational Qualification': 'educationalQual',
    'Email address': 'email',
    'Emergency Contact Name': 'emergencyContactName',
    'Emergency Contact Number': 'emergencyContactNumber',
    'Emergency Contact Relation': 'emergencyContactRelation',
    'Full Name': 'name',
    'Ganvesh Kurta Shoulder Size in cm (for swayamevaks and sevikas)': 'ganveshSize',
    'Gender': 'gender',
    'Occupation (e.g. Engineer/Business/Homemaker/Student)': 'occupation',
    'Phone number on which you can be contacted in Bharat (by call or WhatsApp)': 'phone',
    'Place of Arrival': 'arrivalPlace',
    'Place of Departure Train/Flight': 'departurePlace',
    'Please select a post shibir tour option': 'postShibirTour',
    'Praveshika ID': 'uniqueId',
    'Relationship of Emergency Contact Person': 'emergencyContactRelation',
    'SeqNum': 'seqNum',
    'Shreni': 'shreni',
    'Corrected Shreni': 'shreni',
    'Default Shreni': 'shreni',
    'Status': 'status',
    'Time of Arrival': 'arrivalTime',
    'Time of Departure Train/Flight': 'departureTime',
    'Timestamp': 'createdAt',
    'What is your current responsibility in HSS or other organisation?': 'currentResponsibility',
    'Whatsapp Number': 'whatsapp',
    'Which Sangh Shiksha Varg have you completed': 'shikshaVarg',
    'Zone': 'zone',
    'Zone/Shreni': 'zone'
};

const phoneFields = [
    'phone',
    'Phone number on which you can be contacted in Bharat (by call or WhatsApp)',
    'Phone number',
    'phone number',
    'Phone',
    'Whatsapp Number',
    'whatsapp',
    'WhatsApp',
    'Emergency Contact Number',
    'emergencyContactNumber'
];

// Shared utility functions
function isValidFirestoreFieldName(fieldName) {
    if (!fieldName || fieldName.trim() === '') {
        return false;
    }
    // Firestore field names cannot contain: * ~ / [ ]
    // Note: ( and ) are technically valid but we remove them for consistency
    const invalidChars = ['*', '~', '/', '[', ']'];
    for (const char of invalidChars) {
        if (fieldName.includes(char)) {
            return false;
        }
    }
    return true;
}

function hasInvalidCharsForCleanup(fieldName) {
    if (!fieldName || fieldName.trim() === '') {
        return false;
    }
    // For cleanup, also check for ( and ) as user requested
    const invalidChars = ['*', '~', '/', '[', ']', '(', ')'];
    for (const char of invalidChars) {
        if (fieldName.includes(char)) {
            return true;
        }
    }
    return false;
}

function safeAddToUpdateData(updateData, fieldName, value) {
    if (isValidFirestoreFieldName(fieldName)) {
        updateData[fieldName] = value;
        return true;
    } else {
        console.log(`  Warning: Attempted to add invalid field name "${fieldName}" to update data - skipping`);
        return false;
    }
}

async function fetchAllRegistrations(pageSize = 3000) {
    let allDocs = [];
    let lastDoc = null;

    do {
        let query = db.collection('registrations').limit(pageSize);
        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }
        
        const snapshot = await query.get();
        if (snapshot.empty) break;
        
        allDocs = allDocs.concat(snapshot.docs);
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        console.log(`  Fetched ${allDocs.length} registrations so far...`);
    } while (lastDoc);

    return allDocs;
}

// ============================================================================
// IMPORT FUNCTION
// ============================================================================

async function importExcelData() {
    const excelFilePath = process.env.EXCEL_FILE_PATH || 'dataprocessing/Registrations_12_13.xlsx';
    let workbook;
    try {
        workbook = XLSX.readFile(excelFilePath);
    } catch (e) {
        console.error(`Error: Excel file not found at ${excelFilePath}`);
        console.error('Set EXCEL_FILE_PATH environment variable to specify a different path.');
        process.exit(1);
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Found ${data.length} records in Excel file`);

    let successCount = 0;
    let errorCount = 0;
    const emailToUidsMap = new Map();

    for (const row of data) {
        try {
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

            const normalizedPraveshikaId = praveshikaId.toLowerCase().replace(/[/-]/g, '');
            const praveshikaIdString = String(praveshikaId).trim();

            if (email && email.trim()) {
                const normalizedEmail = email.toLowerCase().trim();
                if (!emailToUidsMap.has(normalizedEmail)) {
                    emailToUidsMap.set(normalizedEmail, []);
                }
                const existingUids = emailToUidsMap.get(normalizedEmail);
                if (!existingUids.includes(praveshikaIdString)) {
                    existingUids.push(praveshikaIdString);
                }
            }

            const departurePlace = row['Place of Departure Train/Flight'] || row['Place of Departure'] || row['departurePlace'] || '';
            
            const registrationData = {
                uniqueId: praveshikaIdString,
                normalizedId: normalizedPraveshikaId,
                name: name,
                email: email,
                country: country,
                Country: country,
                shreni: shreni,
                Shreni: shreni,
                barcode: barcode,
                Barcode: barcode,
                departurePlace: departurePlace,
                ...row,
                importedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('registrations').doc(praveshikaIdString).set(registrationData);
            console.log(`✓ Imported: ${praveshikaId} - ${name || 'N/A'}`);
            successCount++;

        } catch (error) {
            console.error(`✗ Error importing row:`, error.message);
            errorCount++;
        }
    }

    console.log(`\nUpdating email to UIDs mappings (merging with existing)...`);
    let emailMappingCount = 0;
    let emailMappingErrors = 0;

    for (const [normalizedEmail, newUids] of emailToUidsMap.entries()) {
        try {
            const existingDoc = await db.collection('emailToUids').doc(normalizedEmail).get();
            let allUids = [...newUids];
            
            if (existingDoc.exists) {
                const existingData = existingDoc.data();
                const existingUids = existingData.uids || [];
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

// ============================================================================
// NORMALIZE FUNCTION
// ============================================================================

function normalizeDocumentFields(docData) {
    const updateData = {};
    const fieldsToRemove = [];
    let fieldsUpdated = 0;

    for (const oldFieldName in fieldNameMapping) {
        if (!isValidFirestoreFieldName(oldFieldName)) {
            if (docData.hasOwnProperty(oldFieldName)) {
                const newFieldName = fieldNameMapping[oldFieldName];
                const value = docData[oldFieldName];
                
                if (value !== undefined && value !== null && value !== '') {
                    const existingNewValue = docData[newFieldName];
                    if (!existingNewValue || existingNewValue === '') {
                        if (safeAddToUpdateData(updateData, newFieldName, value)) {
                            fieldsUpdated++;
                        }
                    }
                }
            }
            continue;
        }
        
        if (docData.hasOwnProperty(oldFieldName)) {
            const newFieldName = fieldNameMapping[oldFieldName];
            const value = docData[oldFieldName];

            if (value !== undefined && value !== null && value !== '') {
                const existingNewValue = docData[newFieldName];
                if (!existingNewValue || existingNewValue === '') {
                    if (safeAddToUpdateData(updateData, newFieldName, value)) {
                        fieldsUpdated++;
                    }
                }
            }

            if (oldFieldName !== newFieldName && 
                !systemFields.includes(oldFieldName) && 
                isValidFirestoreFieldName(oldFieldName)) {
                fieldsToRemove.push(oldFieldName);
            }
        }
    }

    for (const oldField of fieldsToRemove) {
        if (docData.hasOwnProperty(oldField)) {
            safeAddToUpdateData(updateData, oldField, admin.firestore.FieldValue.delete());
        }
    }
    
    const safeUpdateData = {};
    for (const key in updateData) {
        if (isValidFirestoreFieldName(key)) {
            safeUpdateData[key] = updateData[key];
        } else {
            console.log(`  Warning: Removing invalid field name "${key}" from update data (contains invalid characters)`);
        }
    }
    
    safeUpdateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    return { updateData: safeUpdateData, fieldsUpdated };
}

async function normalizeFieldNames() {
    console.log(`Starting field name normalization for ALL participants...\n`);
    console.log(`Fetching all registrations from Firestore...`);

    const allDocs = await fetchAllRegistrations();
    console.log(`\nFound ${allDocs.length} total registrations to process.\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalFieldsUpdated = 0;
    const batchSize = 10;

    for (let i = 0; i < allDocs.length; i += batchSize) {
        const batch = allDocs.slice(i, i + batchSize);
        const batchPromises = batch.map(async (docSnapshot) => {
            try {
                const docRef = docSnapshot.ref;
                const docData = docSnapshot.data();
                const docId = docSnapshot.id;

                const { updateData, fieldsUpdated } = normalizeDocumentFields(docData);

                if (Object.keys(updateData).length > 0) {
                    await docRef.update(updateData);
                    console.log(`✓ Updated: ${docId} (${fieldsUpdated} fields normalized)`);
                    return { success: true, fieldsUpdated };
                } else {
                    return { success: true, skipped: true };
                }
            } catch (error) {
                console.error(`✗ Error updating ${docSnapshot.id}:`, error.message);
                return { success: false, error: error.message };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result.success) {
                if (result.skipped) {
                    skippedCount++;
                } else {
                    successCount++;
                    totalFieldsUpdated += result.fieldsUpdated || 0;
                }
            } else {
                errorCount++;
            }
        }

        if (i + batchSize < allDocs.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`\n=== Normalization Summary ===`);
    console.log(`Total participants processed: ${allDocs.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Skipped (no changes): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total fields normalized: ${totalFieldsUpdated}`);
}

// ============================================================================
// CLEANUP FUNCTION
// ============================================================================

function cleanInvalidFields(docData) {
    const cleanedData = {};
    const invalidFields = [];
    
    for (const fieldName in docData) {
        // Keep valid fields and system fields (system fields may have invalid chars but we preserve them)
        if ((!hasInvalidCharsForCleanup(fieldName) && isValidFirestoreFieldName(fieldName)) || systemFields.includes(fieldName)) {
            cleanedData[fieldName] = docData[fieldName];
        } else {
            invalidFields.push(fieldName);
        }
    }
    
    return { cleanedData, invalidFields };
}

async function cleanupInvalidFields() {
    console.log(`Starting cleanup of invalid fields from ALL registrations...\n`);
    console.log(`Fetching all registrations from Firestore...`);

    const allDocs = await fetchAllRegistrations();
    console.log(`\nFound ${allDocs.length} total registrations to process.\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalInvalidFieldsRemoved = 0;
    const batchSize = 10;

    for (let i = 0; i < allDocs.length; i += batchSize) {
        const batch = allDocs.slice(i, i + batchSize);
        const batchPromises = batch.map(async (docSnapshot) => {
            try {
                const docRef = docSnapshot.ref;
                const docData = docSnapshot.data();
                const docId = docSnapshot.id;

                const { cleanedData, invalidFields } = cleanInvalidFields(docData);

                if (invalidFields.length > 0) {
                    await docRef.set(cleanedData);
                    console.log(`✓ Cleaned: ${docId} (removed ${invalidFields.length} invalid field(s): ${invalidFields.join(', ')})`);
                    return { success: true, removed: invalidFields.length };
                } else {
                    return { success: true, skipped: true };
                }
            } catch (error) {
                console.error(`✗ Error cleaning ${docSnapshot.id}:`, error.message);
                return { success: false, error: error.message };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result.success) {
                if (result.skipped) {
                    skippedCount++;
                } else {
                    successCount++;
                    totalInvalidFieldsRemoved += result.removed || 0;
                }
            } else {
                errorCount++;
            }
        }

        if (i + batchSize < allDocs.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`\n=== Cleanup Summary ===`);
    console.log(`Total participants processed: ${allDocs.length}`);
    console.log(`Successfully cleaned: ${successCount}`);
    console.log(`Skipped (no invalid fields): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total invalid fields removed: ${totalInvalidFieldsRemoved}`);
}

// ============================================================================
// FIND NEGATIVE PHONES FUNCTION
// ============================================================================

function isNegativeNumber(value) {
    if (value === null || value === undefined || value === '') {
        return false;
    }
    const num = Number(value);
    return !isNaN(num) && num < 0;
}

async function findNegativePhones() {
    console.log(`Finding all phone numbers that are negative numbers...\n`);
    console.log(`Fetching all registrations from Firestore...`);

    const allDocs = await fetchAllRegistrations();
    console.log(`\nFound ${allDocs.length} total registrations to check.\n`);

    const negativePhones = [];
    let checkedCount = 0;

    for (const docSnapshot of allDocs) {
        const docData = docSnapshot.data();
        const docId = docSnapshot.id;
        const name = docData.name || docData['Full Name'] || docData['Name'] || 'N/A';
        
        for (const fieldName of phoneFields) {
            const phoneValue = docData[fieldName];
            
            if (isNegativeNumber(phoneValue)) {
                negativePhones.push({
                    docId: docId,
                    name: name,
                    fieldName: fieldName,
                    phoneValue: phoneValue,
                    email: docData.email || docData['Email address'] || 'N/A'
                });
            }
        }
        
        checkedCount++;
        
        if (checkedCount % 100 === 0) {
            console.log(`  Checked ${checkedCount} registrations...`);
        }
    }

    console.log(`\n=== Results ===`);
    console.log(`Total registrations checked: ${checkedCount}`);
    console.log(`Found ${negativePhones.length} negative phone numbers:\n`);

    if (negativePhones.length > 0) {
        console.log('Negative Phone Numbers:');
        console.log('='.repeat(80));
        
        negativePhones.forEach((entry, index) => {
            console.log(`\n${index + 1}. Document ID: ${entry.docId}`);
            console.log(`   Name: ${entry.name}`);
            console.log(`   Email: ${entry.email}`);
            console.log(`   Field: ${entry.fieldName}`);
            console.log(`   Phone Value: ${entry.phoneValue}`);
        });
        
        console.log('\n' + '='.repeat(80));
        
        const byField = {};
        negativePhones.forEach(entry => {
            if (!byField[entry.fieldName]) {
                byField[entry.fieldName] = [];
            }
            byField[entry.fieldName].push(entry);
        });
        
        console.log('\nSummary by Field:');
        for (const [fieldName, entries] of Object.entries(byField)) {
            console.log(`  ${fieldName}: ${entries.length} negative value(s)`);
        }
    } else {
        console.log('No negative phone numbers found! ✓');
    }
}

// ============================================================================
// REMOVE SPECIFIC FIELDS FUNCTION
// ============================================================================

async function removeSpecificFields() {
    const fieldsToRemove = [
        'Shreni for Sorting',
        'Registration Lookup Helper'
    ];

    console.log(`Removing specific fields from ALL registrations...\n`);
    console.log(`Fields to remove: ${fieldsToRemove.join(', ')}\n`);
    console.log(`Fetching all registrations from Firestore...`);

    const allDocs = await fetchAllRegistrations();
    console.log(`\nFound ${allDocs.length} total registrations to process.\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalFieldsRemoved = 0;
    const batchSize = 10;

    for (let i = 0; i < allDocs.length; i += batchSize) {
        const batch = allDocs.slice(i, i + batchSize);
        const batchPromises = batch.map(async (docSnapshot) => {
            try {
                const docRef = docSnapshot.ref;
                const docData = docSnapshot.data();
                const docId = docSnapshot.id;

                // Check which fields exist and need to be removed
                const fieldsFound = [];
                const updateData = {};

                for (const fieldName of fieldsToRemove) {
                    if (docData.hasOwnProperty(fieldName)) {
                        fieldsFound.push(fieldName);
                        updateData[fieldName] = admin.firestore.FieldValue.delete();
                    }
                }

                // Only update if there are fields to remove
                if (fieldsFound.length > 0) {
                    await docRef.update(updateData);
                    console.log(`✓ Removed from ${docId}: ${fieldsFound.join(', ')}`);
                    return { success: true, removed: fieldsFound.length };
                } else {
                    return { success: true, skipped: true };
                }
            } catch (error) {
                console.error(`✗ Error removing fields from ${docSnapshot.id}:`, error.message);
                return { success: false, error: error.message };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result.success) {
                if (result.skipped) {
                    skippedCount++;
                } else {
                    successCount++;
                    totalFieldsRemoved += result.removed || 0;
                }
            } else {
                errorCount++;
            }
        }

        if (i + batchSize < allDocs.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`\n=== Removal Summary ===`);
    console.log(`Total participants processed: ${allDocs.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Skipped (fields not found): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total fields removed: ${totalFieldsRemoved}`);
}

// ============================================================================
// UPDATE STATUS FUNCTION
// ============================================================================

async function updateStatusToRejected() {
    const participantIds = [
        'AFKK2485',
        'AFSK2422',
        'AFYV2546',
        'ARBA1601',
        'ARKI4037',
        'ARKK1187',
        'ARKK1295',
        'ARKK1655',
        'ARKK2098',
        'ARKK2603',
        'ARKK2648',
        'ARKK2656',
        'ARKK2663',
        'ARSK2462',
        'ARYV1599',
        'ASBA2704',
        'ASBA4279',
        'ASKI1880',
        'ASKK1030',
        'ASKK1522',
        'ASKK2179',
        'ASKK2825',
        'ASKK2836',
        'ASKK2844',
        'ASKK2867',
        'ASKK2923',
        'ASKK2954',
        'ASKK2970',
        'ASKK2972',
        'ASKK2987',
        'ASKK3010',
        'ASKK3056',
        'ASKK3083',
        'ASKK4145',
        'ASKK4216',
        'ASSK2434',
        'ASSK2746',
        'ASSK2747',
        'ASSK2761',
        'ASSK2963',
        'ASSK4151',
        'ASYV1727',
        'ASYV1748',
        'ASYV2182',
        'ASYV2567',
        'ASYV2783',
        'ASYV2858',
        'ASYV3058',
        'ASYV3061',
        'ASYV4143',
        'ASYV4146',
        'AUSK1698',
        'AUYV1315',
        'EUBA2687',
        'EUKK2792'
    ];

    console.log(`Updating status to "Rejected" for ${participantIds.length} participants...\n`);

    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    const batchSize = 10;

    for (let i = 0; i < participantIds.length; i += batchSize) {
        const batch = participantIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (participantId) => {
            try {
                const docRef = db.collection('registrations').doc(participantId);
                const doc = await docRef.get();

                if (!doc.exists) {
                    console.log(`⚠ Not found: ${participantId}`);
                    notFoundCount++;
                    return { success: false, notFound: true };
                }

                await docRef.update({
                    status: 'Rejected',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const name = doc.data().name || doc.data()['Full Name'] || 'N/A';
                console.log(`✓ Updated: ${participantId} - ${name}`);
                return { success: true };
            } catch (error) {
                console.error(`✗ Error updating ${participantId}:`, error.message);
                errorCount++;
                return { success: false, error: error.message };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result.success) {
                successCount++;
            }
        }

        // Small delay between batches to avoid rate limits
        if (i + batchSize < participantIds.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`\n=== Status Update Summary ===`);
    console.log(`Total participants to update: ${participantIds.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Not found: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
}

async function updateStatusToCancelled() {
    const participantIds = [
        'AFBA1937',
        'AFKI1466',
        'AFKI1789',
        'AFKK1177',
        'AFKK1178',
        'AFKK1271',
        'AFKK1278',
        'AFKK1347',
        'AFKK1371',
        'AFKK1372',
        'AFKK1460',
        'AFKK1496',
        'AFKK1644',
        'AFKK1806',
        'AFKK1843',
        'AFKK1844',
        'AFKK2225',
        'AFKK2830',
        'AFSK1341',
        'AFSK1463',
        'AFSK1464',
        'AFSK1539',
        'AFSK1818',
        'AFSK1935',
        'AFSK1936',
        'AFSK2062',
        'AFSK2084',
        'AFSK2092',
        'AFSK2524',
        'AFSK2623',
        'AFYV1367',
        'AFYV1465',
        'AFYV1485',
        'AFYV1788',
        'AFYV2052',
        'AFYV2390',
        'AFYV2523',
        'AMKK1043',
        'AMKK1053',
        'AMKK1054',
        'AMKK1059',
        'AMKK1095',
        'AMKK1202',
        'AMKK1203',
        'AMKK1270',
        'AMKK1285',
        'AMKK1587',
        'AMKK1617',
        'AMKK1627',
        'AMKK1636',
        'AMKK1804',
        'AMKK1855',
        'AMKK2038',
        'AMKK2069',
        'AMKK2113',
        'AMKK2119',
        'AMKK2128',
        'AMKK2129',
        'AMKK2143',
        'AMKK2184',
        'AMKK2207',
        'AMKK2311',
        'AMKK2336',
        'AMKK2439',
        'AMKK2511',
        'AMKK2543',
        'AMKK2554',
        'AMKK2588',
        'AMKK2589',
        'AMKK2645',
        'AMKK2662',
        'AMKK2692',
        'AMKK3087',
        'AMKK3094',
        'AMKK3095',
        'AMKK4002',
        'AMKK4015',
        'AMKK4149',
        'AMSK1584',
        'AMSK1637',
        'AMSK1864',
        'AMSK2185',
        'AMSK2438',
        'AMSK2555',
        'AMSK3063',
        'AMYV1067',
        'AMYV1638',
        'AMYV1639',
        'AMYV1762',
        'AMYV2595',
        'AMYV4018',
        'AMYV4019',
        'ARBA1024',
        'ARBA1025',
        'ARBA1344',
        'ARBA1345',
        'ARBA1835',
        'ARBA4066',
        'ARKI1022',
        'ARKI2611',
        'ARKI3060',
        'ARKK1021',
        'ARKK1208',
        'ARKK1215',
        'ARKK1250',
        'ARKK1260',
        'ARKK1262',
        'ARKK1648',
        'ARKK1738',
        'ARKK1763',
        'ARKK1832',
        'ARKK1837',
        'ARKK1838',
        'ARKK1845',
        'ARKK1856',
        'ARKK1896',
        'ARKK1956',
        'ARKK1958',
        'ARKK2548',
        'ARKK2870',
        'ARKK4251',
        'ARSK1023',
        'ARSK1233',
        'ARSK1241',
        'ARSK1343',
        'ARSK1642',
        'ARSK1663',
        'ARSK1833',
        'ARSK1842',
        'ARSK1915',
        'ARSK2310',
        'ARSK2326',
        'ARSK2608',
        'ARSK2805',
        'ARSK2806',
        'ARSK3057',
        'ARYV1744',
        'ARYV1834',
        'ARYV1858',
        'ASBA1093',
        'ASBA1127',
        'ASBA1144',
        'ASBA1263',
        'ASBA1647',
        'ASBA1675',
        'ASBA1676',
        'ASBA3044',
        'ASBA3045',
        'ASBA3047',
        'ASBA4223',
        'ASBA4224',
        'ASFALSE4174',
        'ASFALSE4175',
        'ASFALSE4176',
        'ASKI1086',
        'ASKI1126',
        'ASKI1143',
        'ASKI1159',
        'ASKI1360',
        'ASKI1645',
        'ASKI2014',
        'ASKI2015',
        'ASKI4194',
        'ASKK1224',
        'ASKK1505',
        'ASKK1510',
        'ASKK1524',
        'ASKK1597',
        'ASKK1651',
        'ASKK1661',
        'ASKK1667',
        'ASKK1679',
        'ASKK1682',
        'ASKK1705',
        'ASKK1709',
        'ASKK1785',
        'ASKK1821',
        'ASKK1822',
        'ASKK1827',
        'ASKK1904',
        'ASKK2056',
        'ASKK2095',
        'ASKK2097',
        'ASKK2144',
        'ASKK2229',
        'ASKK2251',
        'ASKK2307',
        'ASKK2320',
        'ASKK2346',
        'ASKK2364',
        'ASKK2430',
        'ASKK2449',
        'ASKK2450',
        'ASKK2740',
        'ASKK2798',
        'ASKK2892',
        'ASKK2956',
        'ASKK2959',
        'ASKK2979',
        'ASKK2982',
        'ASKK2983',
        'ASKK4034',
        'ASKK4111',
        'ASKK4130',
        'ASKK4200',
        'ASSK1085',
        'ASSK1125',
        'ASSK1212',
        'ASSK1358',
        'ASSK1660',
        'ASSK1662',
        'ASSK1673',
        'ASSK1683',
        'ASSK1695',
        'ASSK1696',
        'ASSK1706',
        'ASSK1713',
        'ASSK1724',
        'ASSK1743',
        'ASSK1849',
        'ASSK1866',
        'ASSK1868',
        'ASSK2194',
        'ASSK2300',
        'ASSK2318',
        'ASSK2642',
        'ASSK2750',
        'ASSK2817',
        'ASSK2840',
        'ASSK3042',
        'ASSK3043',
        'ASSK3075',
        'ASSK3080',
        'ASSK3090',
        'ASSK3096',
        'ASSK4077',
        'ASSK4121',
        'ASSK4131',
        'ASSK4172',
        'ASSK4173',
        'ASSK4192',
        'ASSK4193',
        'ASSK4201',
        'ASSK4212',
        'ASSK4221',
        'ASSK4222',
        'ASYV1186',
        'ASYV1249',
        'ASYV1252',
        'ASYV1451',
        'ASYV1531',
        'ASYV1643',
        'ASYV1646',
        'ASYV1726',
        'ASYV1728',
        'ASYV1820',
        'ASYV1892',
        'ASYV2281',
        'ASYV2491',
        'ASYV2795',
        'ASYV4110',
        'AUKI1074',
        'AUKK1072',
        'AUKK1073',
        'AUKK1316',
        'AUKK1436',
        'AUKK1624',
        'AUKK1634',
        'AUKK2005',
        'AUKK2039',
        'AUKK2167',
        'AUKK2214',
        'AUKK2215',
        'AUKK2435',
        'AUKK2720',
        'AUKK2809',
        'AUKK4202',
        'AUSK1317',
        'AUSK1625',
        'AUSK2811',
        'AUYV1318',
        'AUYV1578',
        'AUYV2797',
        'EUKI2029',
        'EUKK1014',
        'EUKK1080',
        'EUKK1102',
        'EUKK1454',
        'EUKK1482',
        'EUKK1484',
        'EUKK1518',
        'EUKK1532',
        'EUKK1548',
        'EUKK1813',
        'EUKK2021',
        'EUKK2036',
        'EUKK2067',
        'EUKK2094',
        'EUKK2327',
        'EUKK2414',
        'EUKK2469',
        'EUKK2488',
        'EUKK2500',
        'EUKK2570',
        'EUKK2630',
        'EUSK1549',
        'EUSK1747',
        'EUSK2226',
        'EUSK2391',
        'EUSK2399',
        'EUSK2614',
        'EUSK4033',
        'EUYV1770',
        'EUYV1854',
        'EUYV1863',
        'EUYV1984',
        'EUYV2613'
    ];

    console.log(`Updating status to "Cancelled" for ${participantIds.length} participants...\n`);

    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    const batchSize = 10;

    for (let i = 0; i < participantIds.length; i += batchSize) {
        const batch = participantIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (participantId) => {
            try {
                const docRef = db.collection('registrations').doc(participantId);
                const doc = await docRef.get();

                if (!doc.exists) {
                    console.log(`⚠ Not found: ${participantId}`);
                    notFoundCount++;
                    return { success: false, notFound: true };
                }

                await docRef.update({
                    status: 'Cancelled',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const name = doc.data().name || doc.data()['Full Name'] || 'N/A';
                console.log(`✓ Updated: ${participantId} - ${name}`);
                return { success: true };
            } catch (error) {
                console.error(`✗ Error updating ${participantId}:`, error.message);
                errorCount++;
                return { success: false, error: error.message };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result.success) {
                successCount++;
            }
        }

        // Small delay between batches to avoid rate limits
        if (i + batchSize < participantIds.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`\n=== Status Update Summary ===`);
    console.log(`Total participants to update: ${participantIds.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Not found: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
}

async function updateStatusToApproved() {
    const participantIds = [
        'AFKK2446',
        'AFKK2625',
        'AFKK2696',
        'AFKK2762',
        'AFSK1616',
        'AFSK2090',
        'AFSK2737',
        'AFYV1559',
        'AMKK2223',
        'AMSK1836',
        'ARYV1501',
        'ASKK1205',
        'ASKK2793',
        'ASSK2522',
        'ASSK2739',
        'ASSK4062',
        'AUKK2195',
        'AUKK2324',
        'AUKK2683',
        'AUSK1045',
        'AUSK2246',
        'EUKK1119',
        'EUKK1517',
        'EUKK1549',
        'EUKK1737',
        'EUKK1745',
        'EUKK2006',
        'EUKK2111',
        'EUKK2163',
        'EUKK2552',
        'EUKK2714',
        'EUKK2275',
        'EUSK1924',
        'EUSK2064',
        'EUSK2065',
        'EUSK2162',
        'EUSK2476',
        'EUYV1430'
    ];

    console.log(`Updating status to "Approved" for ${participantIds.length} participants...\n`);

    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    const batchSize = 10;

    for (let i = 0; i < participantIds.length; i += batchSize) {
        const batch = participantIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (participantId) => {
            try {
                const docRef = db.collection('registrations').doc(participantId);
                const doc = await docRef.get();

                if (!doc.exists) {
                    console.log(`⚠ Not found: ${participantId}`);
                    notFoundCount++;
                    return { success: false, notFound: true };
                }

                await docRef.update({
                    status: 'Approved',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const name = doc.data().name || doc.data()['Full Name'] || 'N/A';
                console.log(`✓ Updated: ${participantId} - ${name}`);
                return { success: true };
            } catch (error) {
                console.error(`✗ Error updating ${participantId}:`, error.message);
                errorCount++;
                return { success: false, error: error.message };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result.success) {
                successCount++;
            }
        }

        // Small delay between batches to avoid rate limits
        if (i + batchSize < participantIds.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`\n=== Status Update Summary ===`);
    console.log(`Total participants to update: ${participantIds.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Not found: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

const command = process.argv[2] || process.env.COMMAND || 'help';

async function main() {
    try {
        switch (command) {
            case 'import':
                await importExcelData();
                break;
            case 'normalize':
                await normalizeFieldNames();
                break;
            case 'cleanup':
                await cleanupInvalidFields();
                break;
            case 'find-negative-phones':
                await findNegativePhones();
                break;
            case 'remove-fields':
                await removeSpecificFields();
                break;
            case 'reject-status':
                await updateStatusToRejected();
                break;
            case 'cancel-status':
                await updateStatusToCancelled();
                break;
            case 'approve-status':
                await updateStatusToApproved();
                break;
            default:
                console.log('Usage: node firestore-utils.js <command>');
                console.log('Commands:');
                console.log('  import              - Import Excel data to Firestore');
                console.log('  normalize           - Normalize field names to camelCase');
                console.log('  cleanup             - Remove fields with invalid Firestore characters');
                console.log('  find-negative-phones - Find phone numbers that are negative');
                console.log('  remove-fields       - Remove "Shreni for Sorting" and "Registration Lookup Helper" fields');
                console.log('  reject-status       - Update status to "Rejected" for specific participant IDs');
                console.log('  cancel-status       - Update status to "Cancelled" for specific participant IDs');
                console.log('  approve-status      - Update status to "Approved" for specific participant IDs');
                process.exit(1);
        }
        console.log('\nProcess finished');
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();

