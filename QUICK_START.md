# Quick Start Guide - Firebase Setup

## ⚡ Quick Setup (5 minutes)

### Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Name: `VSS2025`
4. Click through the setup (you can skip Analytics)

### Step 2: Enable Email Authentication
1. In Firebase Console, click **Authentication** → **Get started**
2. Click **Sign-in method** tab
3. Enable **Email/Password**
4. Click **Save**

### Step 3: Create Firestore Database
1. Click **Firestore Database** → **Create database**
2. Select **Start in test mode**
3. Choose location (e.g., `asia-south1`)
4. Click **Enable**

### Step 4: Add a Test Registration
1. In Firestore, click **Start collection**
2. Collection ID: `registrations`
3. Add document with ID: `TEST001`
4. Add fields:
   - `name` (string): `John Doe`
   - `email` (string): `john@example.com`
   - `uniqueId` (string): `TEST001`

### Step 5: Get Your Config
1. Go to **Project Settings** (gear icon ⚙️)
2. Scroll down to **Your apps**
3. Click **Web** icon `</>`
4. Register app name: `VSS2025 Web`
5. Copy the config code

### Step 6: Add Config to Your Project
1. Open `firebase-config.js` in your project
2. Replace the placeholder values with your actual config:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",           // ← Paste your values here
     authDomain: "...",              // ←
     projectId: "...",               // ←
     storageBucket: "...",           // ←
     messagingSenderId: "...",       // ←
     appId: "..."                    // ←
   };
   ```

### Step 7: Test It!
1. Open `index.html` in a browser
2. Click **Register**
3. Enter:
   - Name: `John Doe`
   - Unique ID: `TEST001`
   - Email: `john@example.com`
4. Click **Verify & Continue**
5. Set a password (min 6 characters)
6. Click **Create Account**
7. Try logging in with your email and password!

## 📚 Need More Help?

See `FIREBASE_SETUP_GUIDE.md` for detailed instructions and troubleshooting.

## 🔒 Security Note

Before going live, update Firestore security rules (see `FIREBASE_SETUP_GUIDE.md` Step 6).

