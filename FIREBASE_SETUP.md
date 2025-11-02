# Firebase Setup Guide for Crypto Signal Checker

## Step 1: Create or Access Your Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard

## Step 2: Get Your Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. If you don't have a web app yet:
   - Click "Add app" button
   - Select the web icon `</>`
   - Register the app (name it "CryptoSignalChecker")
   - Copy the configuration object

## Step 3: Update Your Firebase Config in the Project

Open `src/firebase.js` and replace the placeholder config with your actual values:

```javascript
const firebaseConfig = {
  apiKey: "AIza...", // Your actual API key
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Step 4: Enable Cloud Functions

1. In Firebase Console, go to **Functions** in the left menu
2. Click "Get started" if this is your first time
3. Follow the prompts to enable Cloud Functions API

## Step 5: Install Firebase CLI (for deploying functions)

Open a new terminal and run:

```bash
npm install -g firebase-tools
firebase login
```

## Step 6: Initialize Firebase Functions in Your Project

Create a new folder for functions (separate from your React app):

```bash
mkdir firebase-functions
cd firebase-functions
firebase init functions
```

Choose:
- Use an existing project
- Select your project
- Choose JavaScript
- Install dependencies: Yes

## Step 7: Create a Sample Cloud Function

Create/edit `firebase-functions/functions/index.js`:

```javascript
const functions = require('firebase-functions');

// Example Cloud Function
exports.getCryptoSignals = functions.https.onCall(async (data, context) => {
  // Check authentication if needed
  // if (!context.auth) {
  //   throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
  // }

  // Example response
  return {
    success: true,
    signals: [
      { symbol: 'BTC/USDT', signal: 'BUY', confidence: 0.85, price: 43500 },
      { symbol: 'ETH/USDT', signal: 'HOLD', confidence: 0.72, price: 2650 },
      { symbol: 'BNB/USDT', signal: 'SELL', confidence: 0.68, price: 315 }
    ],
    timestamp: new Date().toISOString(),
    source: 'Firebase Cloud Function'
  };
});

// You can add more functions here
exports.getMarketData = functions.https.onCall(async (data, context) => {
  return {
    message: 'Market data endpoint',
    data: { /* your data */ }
  };
});
```

## Step 8: Deploy Your Cloud Functions

```bash
cd firebase-functions
firebase deploy --only functions
```

After deployment, you'll see URLs like:
```
✔ functions[getCryptoSignals(us-central1)]: Successful create operation.
Function URL: https://us-central1-your-project.cloudfunctions.net/getCryptoSignals
```

## Step 9: Test Your Cloud Function from the React App

1. Make sure your React app is running (`npm start`)
2. Open http://localhost:3000
3. In the input field, enter your function name (e.g., `getCryptoSignals`)
4. Click "Fetch Data"
5. You should see the data from your Cloud Function

## Alternative: Using Firebase Emulators (Development)

For local development, you can use Firebase Emulators:

```bash
firebase init emulators
# Choose Functions emulator

# Run emulators
firebase emulators:start

# Update firebase.js to use emulator
export const functions = getFunctions(app, 'localhost:5001');
```

## Important Notes

- Cloud Functions billing: Free tier includes 2 million invocations/month
- Functions must be deployed to Firebase (can't use localhost for production)
- Authentication is optional - add it if you want to restrict access
- HTTPS Callable functions are automatically authenticated if you enable auth

## Troubleshooting

If you get CORS errors:
- Make sure your function is deployed as an HTTPS callable function
- Check that your Firebase config is correct

If function not found error:
- Verify the function name matches exactly (case-sensitive)
- Check that the function is deployed successfully
- Wait a few minutes after deploying for propagation

