# Firebase Setup Guide for VSS2025

This guide will walk you through setting up Google Firebase for authentication and database functionality.

## Step 1: Create a Firebase Project

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com/
   - Sign in with your Google account

2. **Create a New Project**
   - Click "Add project" or "Create a project"
   - Enter project name: `VSS2025` (or your preferred name)
   - Click "Continue"

3. **Google Analytics (Optional)**
   - You can enable or disable Google Analytics
   - Click "Continue" either way

4. **Project Creation**
   - Wait for project creation (takes ~30 seconds)
   - Click "Continue" when done

## Step 2: Enable Authentication

1. **Open Authentication**
   - In the left sidebar, click "Authentication"
   - Click "Get started"

2. **Enable Email/Password Sign-in**
   - Click on "Sign-in method" tab
   - Click "Email/Password"
   - Toggle "Enable" to ON
   - Click "Save"

## Step 3: Create Firestore Database

1. **Open Firestore Database**
   - In the left sidebar, click "Firestore Database"
   - Click "Create database"

2. **Choose Security Rules**
   - Select "Start in test mode" (for development)
   - Click "Next"

3. **Choose Location**
   - Select a location closest to your users (e.g., `asia-south1` for India)
   - Click "Enable"

## Step 4: Set Up Database Structure

Your Firestore database needs a collection called `registrations`. Each document will represent a registered participant.

1. **Create Collection**
   - Click "Start collection"
   - Collection ID: `registrations`
   - Click "Next"

2. **Add a Test Document**
   - Document ID: `TEST001` (or any Unique ID)
   - Add these fields:
     ```
     Field name: name        Type: string    Value: John Doe
     Field name: email       Type: string    Value: john@example.com
     Field name: uniqueId    Type: string    Value: TEST001
     Field name: createdAt   Type: timestamp Value: (use current time)
     ```
   - Click "Save"

## Step 5: Get Your Firebase Configuration

1. **Open Project Settings**
   - Click the gear icon ⚙️ next to "Project Overview"
   - Select "Project settings"

2. **Scroll to "Your apps"**
   - Click on the "</>" (Web) icon to add a web app
   - Register app name: `VSS2025 Web`
   - Check "Also set up Firebase Hosting" (optional)
   - Click "Register app"

3. **Copy Firebase Configuration**
   - You'll see a code snippet that looks like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "vss2025-xxxxx.firebaseapp.com",
     projectId: "vss2025-xxxxx",
     storageBucket: "vss2025-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

4. **Add to Your Project**
   - Open `firebase-config.js` in your project
   - Replace the placeholder values with your actual config
   - **IMPORTANT:** Keep this file safe and never commit it to public repositories

## Step 6: Set Up Firestore Security Rules

1. **Open Firestore Rules**
   - In Firestore Database, click "Rules" tab
   - Replace the rules with the contents of `firestore.rules` file in the project root, OR copy the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user owns the registration
    function isOwnerOfRegistration(registrationId) {
      return request.auth != null && 
             exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.uniqueId == registrationId;
    }
    
    // Helper function to normalize Praveshika ID for comparison
    function normalizeId(id) {
      return id.lower().replaceAll('/', '').replaceAll('-', '');
    }
    
    // Registrations collection
    match /registrations/{uniqueId} {
      // Anyone can read for verification
      allow read: if true;
      
      // Only admin can create/delete (handled via Admin SDK)
      allow create, delete: if false;
      
      // Allow authenticated users to update only their own transportation info
      allow update: if request.auth != null && 
                       // Check if user's uniqueId matches (normalized comparison)
                       (isOwnerOfRegistration(uniqueId) ||
                        // Also check normalized comparison for flexible matching
                        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
                         normalizeId(get(/databases/$(database)/documents/users/$(request.auth.uid)).data.uniqueId) == normalizeId(uniqueId))) &&
                       // Only allow updating transportation-related fields
                       request.resource.data.diff(resource.data).affectedKeys()
                         .hasOnly(['pickupLocation', 'Pickup Location', 'arrivalDate', 'Arrival Date',
                                  'arrivalTime', 'Arrival Time', 'flightTrainNumber', 'Flight/Train Number',
                                  'returnDate', 'Return Date', 'returnTime', 'Return Time',
                                  'returnFlightTrainNumber', 'Return Flight/Train Number',
                                  'transportationUpdatedAt']) &&
                       // Ensure critical fields are not modified
                       request.resource.data.uniqueId == resource.data.uniqueId &&
                       request.resource.data.normalizedId == resource.data.normalizedId &&
                       request.resource.data.name == resource.data.name &&
                       request.resource.data.email == resource.data.email;
    }
    
    // Users collection
    match /users/{userId} {
      // Users can only read/write their own data
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

2. **Click "Publish"**

## Step 7: Configure Authentication Settings

1. **Set Authorized Domains**
   - Go to Authentication > Settings > Authorized domains
   - Your localhost and Firebase domain are already added
   - If deploying to a custom domain, add it here

2. **Email Templates (Optional)**
   - Go to Authentication > Templates
   - Customize email templates if needed

## Step 8: Test Your Setup

1. **Open your website**
   - Open `index.html` in a browser or local server

2. **Test Registration**
   - Click "Register"
   - Enter:
     - Name: John Doe (matching your test document)
     - Unique ID: TEST001
     - Email: john@example.com
   - Click "Verify & Continue"
   - You should see a success message

3. **Set Password**
   - After verification, enter a password
   - Complete registration

4. **Test Login**
   - Click "Login"
   - Use the email and password you just set
   - You should be logged in successfully

## Step 9: Production Setup

Before going live, update security rules:

1. **Secure Firestore Rules**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /registrations/{uniqueId} {
         allow read: if true; // Keep public for verification
         allow write: if false; // Admin only
       }
       
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

2. **Add Your Domain**
   - In Authentication > Settings, add your production domain

3. **Enable Email Verification** (Optional)
   - Consider requiring email verification for added security

## Database Structure Reference

### Collection: `registrations`
Each document represents a registered participant:
- **Document ID**: Unique ID (e.g., "TEST001")
- **Fields**:
  - `name` (string): Full name
  - `email` (string): Email address
  - `uniqueId` (string): Unique identifier
  - `createdAt` (timestamp): Registration timestamp

### Collection: `users` (Created automatically)
Each document represents a user account:
- **Document ID**: Firebase Auth UID
- **Fields**:
  - `email` (string): Email address
  - `uniqueId` (string): Link to registration
  - `createdAt` (timestamp): Account creation time

## Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
- Check that you copied the correct API key in `firebase-config.js`

### "Verification failed"
- Ensure the Unique ID and Name match exactly (case-insensitive)
- Check that the document exists in Firestore `registrations` collection

### "Permission denied" errors
- Check Firestore security rules
- Make sure rules are published

### Email not working
- Check spam folder
- Verify email templates in Authentication > Templates
- Check Firebase project billing (some features require paid plan)

## Support Resources

- Firebase Documentation: https://firebase.google.com/docs
- Firestore Documentation: https://firebase.google.com/docs/firestore
- Firebase Auth Documentation: https://firebase.google.com/docs/auth

