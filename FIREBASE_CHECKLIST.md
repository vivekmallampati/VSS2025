# Firebase Settings Checklist

## 🔍 Quick Checks for Firebase Console

### 1. **Project Status**
- [ ] Go to: https://console.firebase.google.com/project/vss2025-a8b47
- [ ] Verify project is **Active** (not paused/disabled)
- [ ] Check project is not in "Testing" mode that restricts access

### 2. **Authentication Settings**
Location: Authentication → Settings

- [ ] **Email/Password is enabled**
  - Go to: Authentication → Sign-in method
  - Email/Password should be **Enabled** (not disabled)
  
- [ ] **Authorized domains**
  - Go to: Authentication → Settings → Authorized domains
  - Verify your deployment domain is listed
  - Common domains should include:
    - `localhost` (for local testing)
    - Your deployed domain (e.g., `yourdomain.com`, `yourdomain.github.io`)
    - `vss2025-a8b47.firebaseapp.com` (Firebase hosting domain)
  
- [ ] **OAuth redirect domains**
  - If using OAuth, verify redirect URIs include your domain

### 3. **Firestore Database Settings**
Location: Firestore Database → Settings

- [ ] **Database is in production mode** (NOT test mode)
  - Test mode allows read/write for 30 days only
  - Go to: Firestore Database → Rules
  - Make sure you have proper security rules (not `allow read, write: if true;`)

- [ ] **Security Rules are published**
  - Go to: Firestore Database → Rules
  - Click "Publish" if you see "Unsaved changes"
  - Rules should match `firestore.rules` file

- [ ] **Database location**
  - Settings → General → Database location
  - Should be set (e.g., `asia-south1`)

### 4. **API Keys & Configuration**
Location: Project Settings → General

- [ ] **API keys are not restricted incorrectly**
  - Go to: Project Settings → General → Your apps
  - Click on your web app
  - Verify the API key matches your `firebase-config.js`
  
- [ ] **Check API key restrictions** (if any)
  - Go to: Google Cloud Console → APIs & Services → Credentials
  - Find your API key
  - If HTTP referrer restrictions exist, ensure your domain is included

### 5. **Billing & Quotas** (if applicable)
- [ ] **Project has billing enabled** (if using paid features)
  - Free tier has limits that might cause issues
  - Go to: Project Settings → Usage and billing

### 6. **Hosting Settings** (if using Firebase Hosting)
Location: Hosting

- [ ] **Domain is properly connected**
  - Go to: Hosting
  - Verify your custom domain is connected and SSL is active

### 7. **Service Accounts** (for admin operations)
Location: Project Settings → Service accounts

- [ ] **Service account key is valid** (if using admin SDK)
  - Check expiration date
  - Verify permissions

## 🚨 Common Issues

### Issue: "Firebase not initialized"
**Possible causes:**
1. `firebase-config.js` file not found (404 error)
   - Check file exists at correct path
   - Verify file is served as JavaScript (not HTML)
   - Check server configuration

2. API key restrictions
   - Check Google Cloud Console for HTTP referrer restrictions
   - Verify your domain is whitelisted

3. Firebase SDKs not loading
   - Check browser console for CDN errors
   - Verify network connectivity to `gstatic.com`

### Issue: "Permission denied"
**Check:**
- Firestore security rules are published
- Rules allow your operations
- User is authenticated (if required)

### Issue: Authentication not working
**Check:**
- Email/Password is enabled in Authentication
- Authorized domains include your deployment domain
- No IP restrictions in Google Cloud Console

## 🔧 Quick Fixes

### If Firestore is in test mode:
1. Go to Firestore Database → Rules
2. Update rules to production rules (from `firestore.rules`)
3. Click "Publish"

### If domain is not authorized:
1. Go to Authentication → Settings → Authorized domains
2. Click "Add domain"
3. Enter your domain (without http/https)
4. Click "Add"

### If API key has restrictions:
1. Go to Google Cloud Console
2. APIs & Services → Credentials
3. Click on your API key
4. Under "Application restrictions"
   - Either set to "None" (for testing)
   - Or add HTTP referrers with your domain

## 📝 Your Current Config
Based on your `firebase-config.js`:
- Project ID: `vss2025-a8b47`
- Auth Domain: `vss2025-a8b47.firebaseapp.com`
- Make sure these match in Firebase Console!

