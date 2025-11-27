// Script to normalize field names for 261 participant records
// Run with: node normalize-field-names.js
// Requires: npm install firebase-admin
// For Docker: docker-compose up normalize-field-names

const admin = require('firebase-admin');

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

// Field name mapping from old format to camelCase format
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

// List of 261 participant IDs (barcodes) that need field name normalization
const participantIds = [
    'AFBA2765', 'AFKI2764', 'AFKK2137', 'AFKK2791', 'AFSK1983', 'AFSK2468', 'AFSK2763',
    'AMBA4016', 'AMKI4049', 'AMKI4050', 'AMKK2221', 'AMKK2223', 'AMKK2368', 'AMKK2841',
    'AMKK4012', 'AMKK4013', 'AMKK4015', 'AMKK4017', 'AMKK4043', 'AMKK4085', 'AMSK1836',
    'AMSK2161', 'AMYV4018', 'AMYV4019', 'ARBA4068', 'ARBA4069', 'ARBA4071', 'ARKI4027',
    'ARKI4037', 'ARKK4024', 'ARKK4026', 'ARKK4042', 'ARKK4044', 'ARKK4078', 'ARSK4025',
    'ARSK4032', 'ARSK4052', 'ARSK4061', 'ARSK4067', 'ARSK4070', 'ARYV4053', 'ASBA2059',
    'ASBA2060', 'ASBA2935', 'ASBA2940', 'ASBA2965', 'ASBA2995', 'ASBA3017', 'ASBA3020',
    'ASBA3033', 'ASBA3044', 'ASBA3045', 'ASBA3047', 'ASKI2864', 'ASKI2906', 'ASKI2961',
    'ASKI2989', 'ASKK2769', 'ASKK2770', 'ASKK2772', 'ASKK2773', 'ASKK2813', 'ASKK2815',
    'ASKK2816', 'ASKK2835', 'ASKK2837', 'ASKK2838', 'ASKK2842', 'ASKK2845', 'ASKK2847',
    'ASKK2849', 'ASKK2850', 'ASKK2851', 'ASKK2852', 'ASKK2853', 'ASKK2854', 'ASKK2855',
    'ASKK2856', 'ASKK2857', 'ASKK2865', 'ASKK2868', 'ASKK2876', 'ASKK2878', 'ASKK2881',
    'ASKK2884', 'ASKK2885', 'ASKK2890', 'ASKK2891', 'ASKK2894', 'ASKK2895', 'ASKK2896',
    'ASKK2897', 'ASKK2899', 'ASKK2900', 'ASKK2902', 'ASKK2905', 'ASKK2907', 'ASKK2908',
    'ASKK2912', 'ASKK2913', 'ASKK2914', 'ASKK2915', 'ASKK2916', 'ASKK2917', 'ASKK2919',
    'ASKK2921', 'ASKK2922', 'ASKK2926', 'ASKK2928', 'ASKK2930', 'ASKK2931', 'ASKK2934',
    'ASKK2936', 'ASKK2937', 'ASKK2938', 'ASKK2939', 'ASKK2941', 'ASKK2942', 'ASKK2944',
    'ASKK2945', 'ASKK2946', 'ASKK2947', 'ASKK2956', 'ASKK2957', 'ASKK2959', 'ASKK2962',
    'ASKK2964', 'ASKK2966', 'ASKK2967', 'ASKK2968', 'ASKK2969', 'ASKK2971', 'ASKK2973',
    'ASKK2975', 'ASKK2976', 'ASKK2977', 'ASKK2978', 'ASKK2979', 'ASKK2980', 'ASKK2983',
    'ASKK2984', 'ASKK2990', 'ASKK2991', 'ASKK2996', 'ASKK2999', 'ASKK3003', 'ASKK3006',
    'ASKK3013', 'ASKK3014', 'ASKK3015', 'ASKK3019', 'ASKK3022', 'ASKK3023', 'ASKK3025',
    'ASKK3026', 'ASKK3027', 'ASKK3030', 'ASKK3032', 'ASKK3036', 'ASKK3038', 'ASKK3039',
    'ASKK3048', 'ASKK3050', 'ASKK3054', 'ASKK3059', 'ASKK3074', 'ASKK3077', 'ASKK3079',
    'ASKK3081', 'ASKK3085', 'ASKK3089', 'ASKK4036', 'ASKK4039', 'ASKK4041', 'ASKK4048',
    'ASKK4083', 'ASSK1205', 'ASSK2771', 'ASSK2774', 'ASSK2840', 'ASSK2843', 'ASSK2846',
    'ASSK2848', 'ASSK2859', 'ASSK2866', 'ASSK2879', 'ASSK2886', 'ASSK2898', 'ASSK2910',
    'ASSK2918', 'ASSK2920', 'ASSK2925', 'ASSK2929', 'ASSK2932', 'ASSK2933', 'ASSK2943',
    'ASSK2949', 'ASSK2952', 'ASSK2953', 'ASSK2981', 'ASSK2985', 'ASSK2992', 'ASSK2993',
    'ASSK3005', 'ASSK3009', 'ASSK3012', 'ASSK3016', 'ASSK3031', 'ASSK3037', 'ASSK3040',
    'ASSK3042', 'ASSK3043', 'ASSK3049', 'ASSK3051', 'ASSK3052', 'ASSK3055', 'ASSK3075',
    'ASSK3078', 'ASSK3080', 'ASSK3086', 'ASSK3090', 'ASSK3096', 'ASSK4035', 'ASSK4062',
    'ASSK4077', 'ASSK4082', 'ASSK4084', 'ASSK4086', 'ASSK4087', 'ASYV2839', 'ASYV2903',
    'ASYV2986', 'ASYV3011', 'ASYV3029', 'ASYV3053', 'ASYV3076', 'ASYV3082', 'ASYV4076',
    'AUBA4010', 'AUBA4011', 'AUBA4060', 'AUKI4005', 'AUKI4009', 'AUKI4059', 'AUKK4006',
    'AUKK4008', 'AUKK4014', 'AUSK4057', 'AUYV4058', 'AUYV4072', 'AUYV4073', 'EUKK1430',
    'EUKK1745', 'EUKK1924', 'EUKK2064', 'EUKK2711', 'EUKK4029', 'EUKK4088', 'EUKK4089',
    'EUSK4020', 'EUYV4080'
];

// System fields that should not be overwritten or removed
const systemFields = ['uniqueId', 'normalizedId', 'importedAt', 'createdAt', 'createdBy', 'updatedAt', 'tourupdateAt', 'travelupdateAt'];

// Validate if a field name is valid for Firestore
// Firestore field paths cannot contain: * ~ / [ ] and cannot be empty
function isValidFirestoreFieldName(fieldName) {
    if (!fieldName || fieldName.trim() === '') {
        return false;
    }
    // Firestore field names cannot contain these characters: * ~ / [ ]
    const invalidChars = ['*', '~', '/', '[', ']'];
    for (const char of invalidChars) {
        if (fieldName.includes(char)) {
            return false;
        }
    }
    return true;
}

// Helper function to safely add a field to updateData (only if field name is valid)
function safeAddToUpdateData(updateData, fieldName, value) {
    if (isValidFirestoreFieldName(fieldName)) {
        updateData[fieldName] = value;
        return true;
    } else {
        console.log(`  Warning: Attempted to add invalid field name "${fieldName}" to update data - skipping`);
        return false;
    }
}

// Normalize field names in a document
function normalizeDocumentFields(docData) {
    const updateData = {};
    const fieldsToRemove = [];
    let fieldsUpdated = 0;

    // First, preserve system fields (don't update these)
    // We'll handle them separately to avoid overwriting

    // Now, map old field names to new ones
    for (const oldFieldName in fieldNameMapping) {
        // Skip processing if the old field name has invalid characters for Firestore
        // These fields likely don't exist in Firestore anyway, but we can still
        // try to copy their values if they exist in docData
        if (!isValidFirestoreFieldName(oldFieldName)) {
            // Even if the field name is invalid, try to copy its value to the new field name
            // This handles cases where data might have been imported incorrectly
            if (docData.hasOwnProperty(oldFieldName)) {
                const newFieldName = fieldNameMapping[oldFieldName];
                const value = docData[oldFieldName];
                
                if (value !== undefined && value !== null && value !== '') {
                    const existingNewValue = docData[newFieldName];
                    if (!existingNewValue || existingNewValue === '') {
                        // Use safe helper to ensure field name is valid
                        if (safeAddToUpdateData(updateData, newFieldName, value)) {
                            fieldsUpdated++;
                        }
                    }
                }
            }
            // Skip trying to delete invalid field names - they can't exist in Firestore
            continue;
        }
        
        if (docData.hasOwnProperty(oldFieldName)) {
            const newFieldName = fieldNameMapping[oldFieldName];
            const value = docData[oldFieldName];

            // Only update if the new field doesn't already exist with a value
            // or if the old field has a value and new field doesn't
            if (value !== undefined && value !== null && value !== '') {
                const existingNewValue = docData[newFieldName];
                if (!existingNewValue || existingNewValue === '') {
                    // Use safe helper to ensure field name is valid
                    if (safeAddToUpdateData(updateData, newFieldName, value)) {
                        fieldsUpdated++;
                    }
                }
            }

            // Mark old field for removal (unless it's the same as new field name, has invalid characters, or is a system field)
            // Only add valid Firestore field names to the removal list
            if (oldFieldName !== newFieldName && 
                !systemFields.includes(oldFieldName) && 
                isValidFirestoreFieldName(oldFieldName)) {
                fieldsToRemove.push(oldFieldName);
            }
        }
    }

    // Delete old field names in Firestore, but skip fields with invalid characters like "/"
    // Note: fieldsToRemove should only contain valid field names now, but double-check anyway
    for (const oldField of fieldsToRemove) {
        // Only delete fields with valid Firestore field names
        // Skip deletion for fields with invalid characters (like "/") to avoid errors
        if (docData.hasOwnProperty(oldField)) {
            // Use safe helper to ensure field name is valid before deletion
            safeAddToUpdateData(updateData, oldField, admin.firestore.FieldValue.delete());
        }
        // Fields with invalid characters (like "/") are skipped - they won't be deleted
    }
    
    // Final safety check: remove any invalid field names from updateData before returning
    // This is a critical safety check to prevent Firestore errors
    const safeUpdateData = {};
    for (const key in updateData) {
        if (isValidFirestoreFieldName(key)) {
            safeUpdateData[key] = updateData[key];
        } else {
            console.log(`  Warning: Removing invalid field name "${key}" from update data (contains invalid characters)`);
        }
    }
    
    // Add updatedAt timestamp (this is always valid)
    safeUpdateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    return { updateData: safeUpdateData, fieldsUpdated };
}

// Process records in batches
async function normalizeFieldNames() {
    console.log(`Starting field name normalization for ${participantIds.length} participants...\n`);

    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    let totalFieldsUpdated = 0;
    const batchSize = 10; // Process 10 records at a time to avoid rate limits

    for (let i = 0; i < participantIds.length; i += batchSize) {
        const batch = participantIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (participantId) => {
            try {
                // Try to find document by barcode or uniqueId
                const docRef = db.collection('registrations').doc(participantId);
                const doc = await docRef.get();

                if (!doc.exists) {
                    // Try searching by barcode field
                    const barcodeQuery = await db.collection('registrations')
                        .where('barcode', '==', participantId)
                        .limit(1)
                        .get();

                    if (barcodeQuery.empty) {
                        // Try searching by BarCode (capitalized)
                        const barCodeQuery = await db.collection('registrations')
                            .where('BarCode', '==', participantId)
                            .limit(1)
                            .get();

                        if (barCodeQuery.empty) {
                            console.log(`⚠ Not found: ${participantId}`);
                            notFoundCount++;
                            return null;
                        } else {
                            const foundDoc = barCodeQuery.docs[0];
                            return { docRef: db.collection('registrations').doc(foundDoc.id), docData: foundDoc.data(), docId: foundDoc.id };
                        }
                    } else {
                        const foundDoc = barcodeQuery.docs[0];
                        return { docRef: db.collection('registrations').doc(foundDoc.id), docData: foundDoc.data(), docId: foundDoc.id };
                    }
                } else {
                    return { docRef, docData: doc.data(), docId: participantId };
                }
            } catch (error) {
                console.error(`✗ Error fetching ${participantId}:`, error.message);
                errorCount++;
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);

        // Process each document in the batch
        for (const result of batchResults) {
            if (!result) continue;

            const { docRef, docData, docId } = result;

            try {
                const { updateData, fieldsUpdated } = normalizeDocumentFields(docData);

                // Only update if there are changes
                if (Object.keys(updateData).length > 0) {
                    // Update the document
                    await docRef.update(updateData);

                    console.log(`✓ Updated: ${docId} (${fieldsUpdated} fields normalized)`);
                    successCount++;
                    totalFieldsUpdated += fieldsUpdated;
                } else {
                    console.log(`- Skipped: ${docId} (no changes needed)`);
                    successCount++;
                }
            } catch (error) {
                console.error(`✗ Error updating ${docId}:`, error.message);
                errorCount++;
            }
        }

        // Small delay between batches to avoid rate limits
        if (i + batchSize < participantIds.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`\n=== Normalization Summary ===`);
    console.log(`Total participants processed: ${participantIds.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Not found: ${notFoundCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total fields normalized: ${totalFieldsUpdated}`);
}

// Run normalization
normalizeFieldNames()
    .then(() => {
        console.log('\nNormalization process finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });

