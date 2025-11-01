# Excel Data Import Guide

This guide explains how to import data from `TestData.xlsx` into Firebase.

> 💡 **New:** You can now use Docker to run the import without installing Node.js! See [Docker Import Guide](./DOCKER_IMPORT_GUIDE.md) for details.

## Prerequisites

1. Node.js installed on your system (or use Docker - see [Docker Import Guide](./DOCKER_IMPORT_GUIDE.md))
2. Firebase project set up (see `FIREBASE_SETUP_GUIDE.md`)
3. Firebase service account key downloaded

## Step 1: Install Dependencies

Run the following command in your project directory:

```bash
npm install
```

This will install:
- `xlsx` - for reading Excel files
- `firebase-admin` - for Firebase Admin SDK

## Step 2: Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (gear icon)
4. Click on **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the JSON file as `serviceAccountKey.json` in the project root directory

**Important**: Never commit `serviceAccountKey.json` to version control. Add it to `.gitignore`.

## Step 3: Prepare Your Excel File

Ensure your `TestData.xlsx` file has the following columns (case-sensitive names will be matched):
- `Praveshika ID` (or `Praveshika_ID`, `Unique ID`, `UniqueID`) - **Required** - Used as document ID
- `Name` (or `name`) - User's full name
- `Email` (or `email`) - User's email address
- `Country` (or `country`) - User's country
- `Shreni` (or `shreni`) - User's shreni
- `Barcode` (or `barcode`) - Barcode value for badge
- Any transportation fields (will be imported as-is)

## Step 4: Run the Import Script

```bash
npm run import
```

Or directly:

```bash
node import-excel-to-firebase.js
```

The script will:
1. Read `TestData.xlsx` from the project root
2. Parse all rows from the first sheet
3. Create documents in the `registrations` collection using Praveshika ID as document ID
4. Store all Excel columns as fields in Firestore

## Step 5: Verify Import

1. Go to Firebase Console > Firestore Database
2. Check the `registrations` collection
3. Verify that documents are created with Praveshika IDs as document IDs
4. Check that all fields are properly imported

## Notes

- The script preserves all fields from Excel, so additional columns will also be imported
- If a document with the same Praveshika ID already exists, it will be overwritten
- The script adds an `importedAt` timestamp to track when data was imported
- Empty cells will be stored as empty strings

## Troubleshooting

### "serviceAccountKey.json not found"
- Make sure you've downloaded the service account key and placed it in the project root
- Check the file name is exactly `serviceAccountKey.json`

### "Cannot find module 'xlsx'"
- Run `npm install` to install dependencies

### "Permission denied" errors
- Check that your service account has Firestore write permissions
- Verify the service account key is valid

### Excel file not found
- Make sure `TestData.xlsx` is in the project root directory
- Check the file name matches exactly (case-sensitive)

## Security Reminder

**NEVER commit `serviceAccountKey.json` to version control!**

Add to `.gitignore`:
```
serviceAccountKey.json
```

