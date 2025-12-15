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
// MIGRATION FUNCTIONS
// ============================================================================

// Migrate non-shibirarthi users (volunteers and admins) to separate collection
async function migrateNonShibirarthiUsers() {
    console.log('Starting migration of non-shibirarthi users...\n');
    
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    try {
        // Fetch all registrations
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Found ${registrationsSnapshot.size} registrations to check...\n`);
        
        const batch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500;
        
        for (const doc of registrationsSnapshot.docs) {
            const data = doc.data();
            const uniqueId = doc.id;
            
            // Check if this is a volunteer or admin
            const shreni = data.shreni || data.Shreni || '';
            const role = data.role || '';
            const isVolunteer = shreni.toLowerCase() === 'volunteer' || role === 'volunteer' || role === 'admin';
            
            if (isVolunteer) {
                try {
                    // Copy to nonShibirarthiUsers collection
                    const newDocRef = db.collection('nonShibirarthiUsers').doc(uniqueId);
                    batch.set(newDocRef, {
                        ...data,
                        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                        originalCollection: 'registrations'
                    });
                    
                    // Delete from registrations
                    const oldDocRef = db.collection('registrations').doc(uniqueId);
                    batch.delete(oldDocRef);
                    
                    batchCount++;
                    migratedCount++;
                    
                    if (batchCount >= BATCH_SIZE) {
                        await batch.commit();
                        console.log(`Migrated ${migratedCount} non-shibirarthi users so far...`);
                        batchCount = 0;
                    }
                } catch (error) {
                    console.error(`Error migrating ${uniqueId}:`, error.message);
                    errorCount++;
                }
            } else {
                skippedCount++;
            }
        }
        
        // Commit remaining batch
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log(`\n=== Migration Summary ===`);
        console.log(`Total registrations checked: ${registrationsSnapshot.size}`);
        console.log(`Migrated to nonShibirarthiUsers: ${migratedCount}`);
        console.log(`Skipped (shibirarthis): ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        
    } catch (error) {
        console.error('Fatal error during migration:', error);
        throw error;
    }
}

// Migrate cancelled/rejected registrations to separate collection
async function migrateCancelledRegistrations() {
    console.log('Starting migration of cancelled/rejected registrations...\n');
    
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    try {
        // Fetch all registrations
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Found ${registrationsSnapshot.size} registrations to check...\n`);
        
        const batch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500;
        
        for (const doc of registrationsSnapshot.docs) {
            const data = doc.data();
            const uniqueId = doc.id;
            const status = data.status || '';
            
            // Check if this is cancelled or rejected
            const isCancelled = status === 'Cancelled' || status === 'Rejected';
            
            if (isCancelled) {
                try {
                    // Copy to cancelledRegistrations collection
                    const newDocRef = db.collection('cancelledRegistrations').doc(uniqueId);
                    batch.set(newDocRef, {
                        ...data,
                        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                        originalCollection: 'registrations',
                        originalStatus: status
                    });
                    
                    // Delete from registrations
                    const oldDocRef = db.collection('registrations').doc(uniqueId);
                    batch.delete(oldDocRef);
                    
                    batchCount++;
                    migratedCount++;
                    
                    if (batchCount >= BATCH_SIZE) {
                        await batch.commit();
                        console.log(`Migrated ${migratedCount} cancelled registrations so far...`);
                        batchCount = 0;
                    }
                } catch (error) {
                    console.error(`Error migrating ${uniqueId}:`, error.message);
                    errorCount++;
                }
            } else {
                skippedCount++;
            }
        }
        
        // Commit remaining batch
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log(`\n=== Migration Summary ===`);
        console.log(`Total registrations checked: ${registrationsSnapshot.size}`);
        console.log(`Migrated to cancelledRegistrations: ${migratedCount}`);
        console.log(`Skipped (approved): ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        
    } catch (error) {
        console.error('Fatal error during migration:', error);
        throw error;
    }
}

// ============================================================================
// DATA NORMALIZATION
// ============================================================================

// Zone normalization mapping
const zoneMapping = {
    'africa': 'AF',
    'af': 'AF',
    'americas': 'AM',
    'am': 'AM',
    'ar': 'AR',
    'australasia': 'AU',
    'au': 'AU',
    'europe': 'EU',
    'eu': 'EU',
    'se asia': 'AS',
    'seasia': 'AS',
    'southeast asia': 'AS',
    'as': 'AS',
    'asia': 'AS'
};

// Normalize zone to standard format
function normalizeZone(zone) {
    if (!zone) return '';
    const zoneTrimmed = zone.toString().trim();
    const zoneLower = zoneTrimmed.toLowerCase();
    
    // First, check for exact match
    if (zoneMapping[zoneLower]) {
        return zoneMapping[zoneLower];
    }
    
    // If no exact match, check if it starts with a zone code
    // This handles cases like "ARBA", "ARKK", "ARYV", "ARSK" -> "AR"
    const zoneCodes = ['af', 'am', 'ar', 'au', 'eu', 'as'];
    for (const code of zoneCodes) {
        if (zoneLower.startsWith(code)) {
            return zoneMapping[code];
        }
    }
    
    // If no match, return uppercase version
    return zoneTrimmed.toUpperCase();
}

// Normalize zones in all registrations
async function normalizeZones() {
    console.log('Normalizing zones...\n');
    
    let updatedCount = 0;
    let errorCount = 0;
    
    try {
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Processing ${registrationsSnapshot.size} registrations...`);
        
        let batch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500;
        
        for (const doc of registrationsSnapshot.docs) {
            const data = doc.data();
            const currentZone = data.zone || data.Zone || data['Zone/Shreni'] || '';
            const normalizedZone = normalizeZone(currentZone);
            
            if (currentZone && normalizedZone && currentZone !== normalizedZone) {
                const docRef = db.collection('registrations').doc(doc.id);
                batch.update(docRef, {
                    zone: normalizedZone,
                    Zone: normalizedZone,
                    normalizedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                batchCount++;
                updatedCount++;
                
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Updated ${updatedCount} registrations so far...`);
                    batch = db.batch(); // Create new batch
                    batchCount = 0;
                }
            }
        }
        
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log(`\n=== Zone Normalization Summary ===`);
        console.log(`Total registrations checked: ${registrationsSnapshot.size}`);
        console.log(`Zones normalized: ${updatedCount}`);
        console.log(`Errors: ${errorCount}`);
        
    } catch (error) {
        console.error('Error normalizing zones:', error);
        throw error;
    }
}

// Normalize date to DD-MMM-YYYY format
function normalizeDate(dateStr) {
    if (!dateStr) return { success: true, normalized: '' };
    
    const str = dateStr.toString().trim();
    
    // Check if already in DD-MMM-YYYY format (e.g., "14-DEC-2025")
    const alreadyNormalized = str.match(/^(\d{2})-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{4})$/i);
    if (alreadyNormalized) {
        // Validate the date
        const day = parseInt(alreadyNormalized[1], 10);
        const monthStr = alreadyNormalized[2].toUpperCase();
        const year = parseInt(alreadyNormalized[3], 10);
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const monthIndex = months.indexOf(monthStr);
        
        if (monthIndex !== -1 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
            // Return in standardized format (uppercase month)
            return { success: true, normalized: `${String(day).padStart(2, '0')}-${monthStr}-${year}` };
        }
    }
    
    // Try to parse various date formats
    let date = null;
    
    // Try Excel serial date (number)
    if (!isNaN(str) && str.indexOf('/') === -1 && str.indexOf('-') === -1) {
        const excelDate = parseFloat(str);
        // Excel epoch is 1900-01-01, but JavaScript uses 1970-01-01
        // Excel dates are days since 1900-01-01, but there's a bug: it treats 1900 as a leap year
        // So we need to adjust: (excelDate - 2) * 86400000 + new Date('1900-01-01').getTime()
        const excelEpoch = new Date(1899, 11, 30).getTime();
        date = new Date(excelEpoch + (excelDate - 1) * 86400000);
        
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            return { success: true, normalized: `${day}-${month}-${year}` };
        }
    }
    
    // Try yyyy-mm-dd format (ISO format, unambiguous)
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1; // JavaScript months are 0-indexed
        const day = parseInt(isoMatch[3], 10);
        date = new Date(year, month, day);
        
        if (!isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
            const dayStr = String(day).padStart(2, '0');
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const monthStr = months[month];
            return { success: true, normalized: `${dayStr}-${monthStr}-${year}` };
        }
    }
    
    // Try mm/dd/yyyy or dd/mm/yyyy format (ambiguous, need to try both carefully)
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const part1 = parseInt(slashMatch[1], 10);
        const part2 = parseInt(slashMatch[2], 10);
        const year = parseInt(slashMatch[3], 10);
        
        // Validate year range
        if (year < 1900 || year > 2100) {
            return { success: false, normalized: str, original: str };
        }
        
        let mmddValid = false;
        let ddmmValid = false;
        let mmddDate = null;
        let ddmmDate = null;
        
        // Try mm/dd/yyyy (if part1 is 1-12, it could be month)
        if (part1 >= 1 && part1 <= 12 && part2 >= 1 && part2 <= 31) {
            const month = part1 - 1; // JavaScript months are 0-indexed
            const day = part2;
            mmddDate = new Date(year, month, day);
            
            if (!isNaN(mmddDate.getTime()) && 
                mmddDate.getFullYear() === year && 
                mmddDate.getMonth() === month && 
                mmddDate.getDate() === day) {
                mmddValid = true;
            }
        }
        
        // Try dd/mm/yyyy (if part2 is 1-12, it could be month)
        if (part2 >= 1 && part2 <= 12 && part1 >= 1 && part1 <= 31) {
            const month = part2 - 1; // JavaScript months are 0-indexed
            const day = part1;
            ddmmDate = new Date(year, month, day);
            
            if (!isNaN(ddmmDate.getTime()) && 
                ddmmDate.getFullYear() === year && 
                ddmmDate.getMonth() === month && 
                ddmmDate.getDate() === day) {
                ddmmValid = true;
            }
        }
        
        // If both are valid and different, it's ambiguous - fail to avoid wrong interpretation
        if (mmddValid && ddmmValid) {
            // Check if they're the same date (e.g., 05/05/2025)
            if (mmddDate.getTime() === ddmmDate.getTime()) {
                // Same date, safe to use either
                const day = mmddDate.getDate();
                const month = mmddDate.getMonth();
                const dayStr = String(day).padStart(2, '0');
                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                const monthStr = months[month];
                return { success: true, normalized: `${dayStr}-${monthStr}-${year}` };
            } else {
                // Ambiguous - both interpretations are valid but different
                // Prefer dd/mm/yyyy as it's more common internationally, but only if part1 > 12 (unambiguous)
                // Otherwise, fail to avoid wrong interpretation
                if (part1 > 12) {
                    // part1 > 12 means it can't be a month, so must be dd/mm/yyyy
                    const day = ddmmDate.getDate();
                    const month = ddmmDate.getMonth();
                    const dayStr = String(day).padStart(2, '0');
                    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                    const monthStr = months[month];
                    return { success: true, normalized: `${dayStr}-${monthStr}-${year}` };
                } else if (part2 > 12) {
                    // part2 > 12 means it can't be a month, so must be mm/dd/yyyy
                    const day = mmddDate.getDate();
                    const month = mmddDate.getMonth();
                    const dayStr = String(day).padStart(2, '0');
                    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                    const monthStr = months[month];
                    return { success: true, normalized: `${dayStr}-${monthStr}-${year}` };
                } else {
                    // Both parts are <= 12, ambiguous - fail
                    return { success: false, normalized: str, original: str };
                }
            }
        }
        
        // Only one is valid, use that one
        if (mmddValid) {
            const day = mmddDate.getDate();
            const month = mmddDate.getMonth();
            const dayStr = String(day).padStart(2, '0');
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const monthStr = months[month];
            return { success: true, normalized: `${dayStr}-${monthStr}-${year}` };
        }
        
        if (ddmmValid) {
            const day = ddmmDate.getDate();
            const month = ddmmDate.getMonth();
            const dayStr = String(day).padStart(2, '0');
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const monthStr = months[month];
            return { success: true, normalized: `${dayStr}-${monthStr}-${year}` };
        }
    }
    
    // Try standard Date parsing as fallback
    date = new Date(str);
    if (!isNaN(date.getTime())) {
        // Validate that the parsed date makes sense (not too far in past/future)
        const year = date.getFullYear();
        if (year >= 1900 && year <= 2100) {
            const day = String(date.getDate()).padStart(2, '0');
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const month = months[date.getMonth()];
            return { success: true, normalized: `${day}-${month}-${year}` };
        }
    }
    
    // Could not parse - return failure
    return { success: false, normalized: str, original: str };
}

// Normalize dates in all registrations
async function normalizeDates() {
    console.log('Normalizing dates...\n');
    
    let updatedCount = 0;
    let errorCount = 0;
    const failedPraveshikaIds = [];
    
    try {
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Processing ${registrationsSnapshot.size} registrations...`);
        
        let batch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500;
        
        for (const doc of registrationsSnapshot.docs) {
            const data = doc.data();
            const updates = {};
            let hasUpdates = false;
            let hasFailures = false;
            const praveshikaId = data.praveshikaId || data.PraveshikaID || data.uniqueId || doc.id;
            
            // Normalize arrival date
            const arrivalDate = data.arrivalDate || data['Date of Arrival'] || '';
            if (arrivalDate) {
                const result = normalizeDate(arrivalDate);
                if (result.success) {
                    if (result.normalized && result.normalized !== arrivalDate) {
                        updates.arrivalDate = result.normalized;
                        updates['Date of Arrival'] = result.normalized;
                        hasUpdates = true;
                    }
                } else {
                    hasFailures = true;
                    console.log(`  Warning: Could not normalize arrival date "${arrivalDate}" for PraveshikaID: ${praveshikaId}`);
                }
            }
            
            // Normalize departure date
            const departureDate = data.departureDate || data['Date of Departure Train/Flight'] || '';
            if (departureDate) {
                const result = normalizeDate(departureDate);
                if (result.success) {
                    if (result.normalized && result.normalized !== departureDate) {
                        updates.departureDate = result.normalized;
                        updates['Date of Departure Train/Flight'] = result.normalized;
                        hasUpdates = true;
                    }
                } else {
                    hasFailures = true;
                    console.log(`  Warning: Could not normalize departure date "${departureDate}" for PraveshikaID: ${praveshikaId}`);
                }
            }
            
            // Track PraveshikaIDs that failed to normalize
            if (hasFailures) {
                failedPraveshikaIds.push({
                    praveshikaId: praveshikaId,
                    arrivalDate: arrivalDate || 'N/A',
                    departureDate: departureDate || 'N/A'
                });
                errorCount++;
            }
            
            if (hasUpdates) {
                const docRef = db.collection('registrations').doc(doc.id);
                updates.normalizedAt = admin.firestore.FieldValue.serverTimestamp();
                batch.update(docRef, updates);
                batchCount++;
                updatedCount++;
                
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Updated ${updatedCount} registrations so far...`);
                    batch = db.batch(); // Create new batch
                    batchCount = 0;
                }
            }
        }
        
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log(`\n=== Date Normalization Summary ===`);
        console.log(`Total registrations checked: ${registrationsSnapshot.size}`);
        console.log(`Dates normalized: ${updatedCount}`);
        console.log(`Failed to normalize: ${errorCount}`);
        
        if (failedPraveshikaIds.length > 0) {
            console.log(`\n=== PraveshikaIDs with Failed Date Normalization ===`);
            console.log(`Total: ${failedPraveshikaIds.length}`);
            console.log('\nPraveshikaID | Arrival Date | Departure Date');
            console.log('-----------------------------------------------');
            for (const failure of failedPraveshikaIds) {
                console.log(`${failure.praveshikaId} | ${failure.arrivalDate} | ${failure.departureDate}`);
            }
        }
        
    } catch (error) {
        console.error('Error normalizing dates:', error);
        throw error;
    }
}

// Pickup location normalization mapping
// Note: Short codes like 'hyd', 'sc', 'hyb', 'kcg' are NOT mapped directly
// They must be combined with location type (airport, station, etc.)
const pickupLocationMapping = {
    // Rajiv Gandhi International Airport (RGIA) variations - must include "airport"
    'rgia': 'Rajiv Gandhi International Airport (RGIA)',
    'rajiv gandhi': 'Rajiv Gandhi International Airport (RGIA)',
    'hyderabad airport': 'Rajiv Gandhi International Airport (RGIA)',
    'hyd airport': 'Rajiv Gandhi International Airport (RGIA)',
    'hyderabad airport (hyd)': 'Rajiv Gandhi International Airport (RGIA)',
    'hyderabad airport hyd': 'Rajiv Gandhi International Airport (RGIA)',
    'airport (hyd)': 'Rajiv Gandhi International Airport (RGIA)',
    'airport hyd': 'Rajiv Gandhi International Airport (RGIA)',
    // Secunderabad Railway Station variations
    'secunderabad': 'Secunderabad Railway Station',
    'secunderabad railway': 'Secunderabad Railway Station',
    'secunderabad station': 'Secunderabad Railway Station',
    'secunderabad station (sc)': 'Secunderabad Railway Station',
    'secunderabad station sc': 'Secunderabad Railway Station',
    'secunderabad (sc)': 'Secunderabad Railway Station',
    'secunderabad sc': 'Secunderabad Railway Station',
    // Nampally Railway Station variations
    'nampally': 'Nampally Railway Station',
    'nampally railway': 'Nampally Railway Station',
    'nampally station': 'Nampally Railway Station',
    'nampally station (hyb)': 'Nampally Railway Station',
    'nampally station hyb': 'Nampally Railway Station',
    'nampally (hyb)': 'Nampally Railway Station',
    'nampally hyb': 'Nampally Railway Station',
    'hyderabad decan': 'Nampally Railway Station',
    'hyderabad deccan': 'Nampally Railway Station',
    'hyderabad decan station': 'Nampally Railway Station',
    'hyderabad deccan station': 'Nampally Railway Station',
    // Kacheguda Railway Station variations
    'kacheguda': 'Kacheguda Railway Station',
    'kacheguda railway': 'Kacheguda Railway Station',
    'kacheguda station': 'Kacheguda Railway Station',
    'kachiguda': 'Kacheguda Railway Station',
    'kachiguda station': 'Kacheguda Railway Station',
    'kachiguda station (kcg)': 'Kacheguda Railway Station',
    'kachiguda station kcg': 'Kacheguda Railway Station',
    'kacheguda station (kcg)': 'Kacheguda Railway Station',
    'kacheguda station kcg': 'Kacheguda Railway Station',
    'kachiguda (kcg)': 'Kacheguda Railway Station',
    'kachiguda kcg': 'Kacheguda Railway Station',
    'kacheguda (kcg)': 'Kacheguda Railway Station',
    'kacheguda kcg': 'Kacheguda Railway Station',
    // Other locations
    'cherlapally': 'Cherlapally Railway Station',
    'cherlapally railway': 'Cherlapally Railway Station',
    'cherlapally station': 'Cherlapally Railway Station',
    'lingampally': 'Lingampally Railway Station',
    'lingampally railway': 'Lingampally Railway Station',
    'lingampally station': 'Lingampally Railway Station',
    'mgbs': 'Mahatma Gandhi Bus Station (MGBS)',
    'gandhi bus station': 'Mahatma Gandhi Bus Station (MGBS)',
    'jbs': 'Jubilee Bus Station (JBS)',
    'jubilee bus station': 'Jubilee Bus Station (JBS)'
};

// Normalize pickup location
function normalizePickupLocation(location) {
    if (!location) return '';
    
    const locationTrimmed = location.toString().trim();
    const locationLower = locationTrimmed.toLowerCase();
    
    // Check if it's already one of the standard options (exact match, case-insensitive)
    const standardOptions = [
        'Rajiv Gandhi International Airport (RGIA)',
        'Secunderabad Railway Station',
        'Nampally Railway Station',
        'Kacheguda Railway Station',
        'Cherlapally Railway Station',
        'Lingampally Railway Station',
        'Mahatma Gandhi Bus Station (MGBS)',
        'Jubilee Bus Station (JBS)',
        'Other'
    ];
    
    // Check for exact match (case-insensitive)
    for (const option of standardOptions) {
        if (locationLower === option.toLowerCase()) {
            return option; // Return the standard format
        }
    }
    
    // Special handling for standalone codes - don't map them
    // HYD alone should NOT map to RGIA (could be anything)
    // SC, HYB, KCG alone should NOT map (too ambiguous)
    const standaloneCodes = ['hyd', 'sc', 'hyb', 'kcg'];
    const trimmedLower = locationLower.trim();
    if (standaloneCodes.includes(trimmedLower)) {
        return 'Other'; // Don't map standalone codes
    }
    
    // Check mapping patterns (order matters - check more specific patterns first)
    // Sort by key length (longer keys first) to match more specific patterns first
    const sortedMappings = Object.entries(pickupLocationMapping).sort((a, b) => b[0].length - a[0].length);
    
    for (const [key, value] of sortedMappings) {
        const keyLower = key.toLowerCase();
        
        // Exact match
        if (locationLower === keyLower) {
            return value;
        }
        
        // Check if location contains the key as a whole word/phrase
        // This prevents "hyd" from matching inside "hyderabad" or other words
        // Match patterns like: "key", "key ", " key", " key ", "(key)", "key)", etc.
        const keyPattern = new RegExp(
            '(^|\\s|\\()' + 
            keyLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + // Escape special regex chars
            '(\\s|\\)|$)', 
            'i'
        );
        
        if (keyPattern.test(locationLower)) {
            return value;
        }
    }
    
    // Return as "Other" if no match
    return 'Other';
}

// Normalize pickup locations in all registrations
async function normalizePickupLocations() {
    console.log('Normalizing pickup locations...\n');
    
    let updatedCount = 0;
    let errorCount = 0;
    
    try {
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Processing ${registrationsSnapshot.size} registrations...`);
        
        let batch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500;
        
        for (const doc of registrationsSnapshot.docs) {
            const data = doc.data();
            const currentLocation = data.arrivalPlace || data['Place of Arrival'] || data.pickupLocation || '';
            const normalizedLocation = normalizePickupLocation(currentLocation);
            
            if (currentLocation && normalizedLocation && currentLocation !== normalizedLocation) {
                const docRef = db.collection('registrations').doc(doc.id);
                const updates = {
                    normalizedPickupLocation: normalizedLocation,
                    normalizedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                
                // Also update the main field if it exists
                if (data.arrivalPlace) {
                    updates.arrivalPlace = normalizedLocation;
                }
                if (data['Place of Arrival']) {
                    updates['Place of Arrival'] = normalizedLocation;
                }
                if (data.pickupLocation) {
                    updates.pickupLocation = normalizedLocation;
                }
                
                batch.update(docRef, updates);
                batchCount++;
                updatedCount++;
                
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Updated ${updatedCount} registrations so far...`);
                    batch = db.batch(); // Create new batch
                    batchCount = 0;
                }
            }
        }
        
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log(`\n=== Pickup Location Normalization Summary ===`);
        console.log(`Total registrations checked: ${registrationsSnapshot.size}`);
        console.log(`Locations normalized: ${updatedCount}`);
        console.log(`Errors: ${errorCount}`);
        
    } catch (error) {
        console.error('Error normalizing pickup locations:', error);
        throw error;
    }
}

// Normalize post tour options
async function normalizePostTourOptions() {
    console.log('Normalizing post tour options...\n');
    
    let updatedCount = 0;
    let errorCount = 0;
    
    const tourMapping = {
        'kandakurti': 'None',
        'yadadri': 'Yadadri and local tour',
        'yadadri mandir': 'Yadadri and local tour',
        'yadadri and local': 'Yadadri and local tour',
        'bhagyanagar': 'Yadadri and local tour',
        'srisailam': 'Srisailam',
        'none': 'None',
        'not selected': 'None',
        'no': 'None'
    };
    
    function normalizeTour(tour) {
        if (!tour) return 'None';
        
        const tourLower = tour.toString().trim().toLowerCase();
        
        // Check exact matches
        for (const [key, value] of Object.entries(tourMapping)) {
            if (tourLower.includes(key)) {
                return value;
            }
        }
        
        // Check if already one of the standard options
        const standardOptions = ['Yadadri and local tour', 'Srisailam', 'None'];
        if (standardOptions.includes(tour)) {
            return tour;
        }
        
        return 'None';
    }
    
    try {
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Processing ${registrationsSnapshot.size} registrations...`);
        
        let batch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500;
        
        for (const doc of registrationsSnapshot.docs) {
            const data = doc.data();
            const currentTour = data.postShibirTour || data['Post Shibir Tour'] || data['Please select a post shibir tour option'] || '';
            const normalizedTour = normalizeTour(currentTour);
            
            if (currentTour && normalizedTour && currentTour !== normalizedTour) {
                const docRef = db.collection('registrations').doc(doc.id);
                const updates = {
                    postShibirTour: normalizedTour,
                    normalizedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                
                // Also update other field names
                if (data['Post Shibir Tour']) {
                    updates['Post Shibir Tour'] = normalizedTour;
                }
                if (data['Please select a post shibir tour option']) {
                    updates['Please select a post shibir tour option'] = normalizedTour;
                }
                
                batch.update(docRef, updates);
                batchCount++;
                updatedCount++;
                
                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Updated ${updatedCount} registrations so far...`);
                    batch = db.batch(); // Create new batch
                    batchCount = 0;
                }
            }
        }
        
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log(`\n=== Post Tour Normalization Summary ===`);
        console.log(`Total registrations checked: ${registrationsSnapshot.size}`);
        console.log(`Tours normalized: ${updatedCount}`);
        console.log(`Errors: ${errorCount}`);
        
    } catch (error) {
        console.error('Error normalizing post tour options:', error);
        throw error;
    }
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

// Find duplicates by name and email
async function findDuplicatesByNameAndEmail() {
    console.log('Finding duplicates by name and email...\n');
    
    const nameEmailMap = new Map();
    const duplicates = [];
    
    try {
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Checking ${registrationsSnapshot.size} registrations...`);
        
        registrationsSnapshot.forEach(doc => {
            const data = doc.data();
            const name = (data.name || data['Full Name'] || '').toLowerCase().trim();
            const email = (data.email || data['Email address'] || '').toLowerCase().trim();
            const uniqueId = data.uniqueId || doc.id;
            
            if (name && email) {
                const key = `${name}|||${email}`;
                if (!nameEmailMap.has(key)) {
                    nameEmailMap.set(key, []);
                }
                nameEmailMap.get(key).push({
                    uniqueId: uniqueId,
                    name: data.name || data['Full Name'] || '',
                    email: data.email || data['Email address'] || '',
                    data: data
                });
            }
        });
        
        // Find entries with multiple registrations
        for (const [key, entries] of nameEmailMap.entries()) {
            if (entries.length > 1) {
                duplicates.push({
                    type: 'name_email',
                    key: key,
                    entries: entries
                });
            }
        }
        
        console.log(`\n=== Duplicates by Name and Email ===`);
        console.log(`Found ${duplicates.length} duplicate groups`);
        
        duplicates.forEach((dup, index) => {
            console.log(`\nGroup ${index + 1}:`);
            dup.entries.forEach(entry => {
                console.log(`  - ${entry.uniqueId}: ${entry.name} (${entry.email})`);
            });
        });
        
        return duplicates;
    } catch (error) {
        console.error('Error finding duplicates:', error);
        throw error;
    }
}

// Find duplicates by last 4 digits of PraveshikaID
async function findDuplicatesByLast4Digits() {
    console.log('Finding duplicates by last 4 digits of PraveshikaID...\n');
    
    const last4Map = new Map();
    const duplicates = [];
    
    try {
        const registrationsSnapshot = await db.collection('registrations').get();
        console.log(`Checking ${registrationsSnapshot.size} registrations...`);
        
        registrationsSnapshot.forEach(doc => {
            const data = doc.data();
            const uniqueId = data.uniqueId || doc.id;
            
            // Extract last 4 digits
            const last4 = uniqueId.slice(-4);
            if (last4 && last4.length === 4 && /^\d{4}$/.test(last4)) {
                if (!last4Map.has(last4)) {
                    last4Map.set(last4, []);
                }
                last4Map.get(last4).push({
                    uniqueId: uniqueId,
                    name: data.name || data['Full Name'] || '',
                    email: data.email || data['Email address'] || '',
                    data: data
                });
            }
        });
        
        // Find entries with multiple registrations
        for (const [last4, entries] of last4Map.entries()) {
            if (entries.length > 1) {
                duplicates.push({
                    type: 'last4',
                    key: last4,
                    entries: entries
                });
            }
        }
        
        console.log(`\n=== Duplicates by Last 4 Digits ===`);
        console.log(`Found ${duplicates.length} duplicate groups`);
        
        duplicates.forEach((dup, index) => {
            console.log(`\nGroup ${index + 1} (Last 4: ${dup.key}):`);
            dup.entries.forEach(entry => {
                console.log(`  - ${entry.uniqueId}: ${entry.name} (${entry.email})`);
            });
        });
        
        return duplicates;
    } catch (error) {
        console.error('Error finding duplicates:', error);
        throw error;
    }
}

// Find all duplicates
async function findAllDuplicates() {
    console.log('Finding all duplicates...\n');
    
    const nameEmailDups = await findDuplicatesByNameAndEmail();
    const last4Dups = await findDuplicatesByLast4Digits();
    
    return {
        nameEmail: nameEmailDups,
        last4: last4Dups,
        total: nameEmailDups.length + last4Dups.length
    };
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
            case 'migrate-non-shibirarthi':
                await migrateNonShibirarthiUsers();
                break;
            case 'migrate-cancelled':
                await migrateCancelledRegistrations();
                break;
            case 'find-duplicates':
                await findAllDuplicates();
                break;
            case 'find-duplicates-name-email':
                await findDuplicatesByNameAndEmail();
                break;
            case 'find-duplicates-last4':
                await findDuplicatesByLast4Digits();
                break;
            case 'normalize-zones':
                await normalizeZones();
                break;
            case 'normalize-dates':
                await normalizeDates();
                break;
            case 'normalize-pickup-locations':
                await normalizePickupLocations();
                break;
            case 'normalize-post-tour':
                await normalizePostTourOptions();
                break;
            case 'normalize-all':
                await normalizeZones();
                await normalizeDates();
                await normalizePickupLocations();
                await normalizePostTourOptions();
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
                console.log('  migrate-non-shibirarthi - Migrate volunteers/admins to nonShibirarthiUsers collection');
                console.log('  migrate-cancelled   - Migrate cancelled/rejected to cancelledRegistrations collection');
                console.log('  find-duplicates     - Find all duplicates (by name+email and last 4 digits)');
                console.log('  find-duplicates-name-email - Find duplicates by name and email');
                console.log('  find-duplicates-last4 - Find duplicates by last 4 digits of PraveshikaID');
                console.log('  normalize-zones     - Normalize zones to AF, AM, AR, AU, EU, AS');
                console.log('  normalize-dates      - Normalize dates to DD-MMM-YYYY format');
                console.log('  normalize-pickup-locations - Normalize pickup locations to standard options');
                console.log('  normalize-post-tour  - Normalize post tour options (Kandakurti->None, etc.)');
                console.log('  normalize-all        - Run all normalization functions');
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

