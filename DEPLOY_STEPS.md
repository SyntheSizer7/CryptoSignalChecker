# Quick Deployment Steps

## Step 1: Login to Firebase CLI

Open your terminal/PowerShell and run:

```
firebase login
```

This will:
1. Open a browser window
2. Ask you to login with your Google account
3. Grant Firebase CLI access
4. Return to terminal when complete

## Step 2: Select or Create Project

After login, check your projects:

```
firebase projects:list
```

If you want to use the project `cryptosignalchecker`, run:

```
firebase use cryptosignalchecker
```

If the project doesn't exist, create it first in Firebase Console (https://console.firebase.google.com/) or use an existing project:

```
firebase use YOUR_EXISTING_PROJECT_ID
```

## Step 3: Deploy to Firebase Hosting

The build folder already exists. Just run:

```
firebase deploy --only hosting
```

This will deploy your app to Firebase Hosting and give you a URL like:
- https://cryptosignalchecker.web.app
- https://cryptosignalchecker.firebaseapp.com

## Current Setup

- ✅ Build folder: `build/` (ready)
- ✅ Firebase config: `firebase.json` (configured)
- ✅ Project ID: `cryptosignalchecker` (in `.firebaserc`)

Once you complete the login in your terminal, the deployment will work!

