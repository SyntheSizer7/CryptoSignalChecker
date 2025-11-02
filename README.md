# Crypto Signal Checker

A React application for fetching data from Firebase Cloud Functions.

## Features

- Clean, modern UI with gradient background
- Input field for Cloud Function name
- Real-time data fetching from Firebase Cloud Functions
- Error handling and loading states
- Responsive design for mobile and desktop
- JSON data display with syntax highlighting

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Open `src/firebase.js`
2. Replace the placeholder Firebase configuration with your actual config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-actual-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 3. Deploy Cloud Functions

Make sure you have Cloud Functions deployed in your Firebase project. The app will call functions by name.

### 4. Run the Application

```bash
npm start
```

The app will open at `http://localhost:3000`

## Usage

1. Enter the name of your Cloud Function in the input field
2. Click "Fetch Data" to call the function
3. View the returned data in the JSON display area

## Example Cloud Function

Here's an example Cloud Function you can deploy:

```javascript
const functions = require('firebase-functions');

exports.getCryptoSignals = functions.https.onCall((data, context) => {
  return {
    signals: [
      { symbol: 'BTC', signal: 'BUY', confidence: 0.85 },
      { symbol: 'ETH', signal: 'HOLD', confidence: 0.72 },
      { symbol: 'ADA', signal: 'SELL', confidence: 0.68 }
    ],
    timestamp: new Date().toISOString()
  };
});
```

## Project Structure

```
src/
├── App.js          # Main application component
├── App.css         # Application styles
├── firebase.js     # Firebase configuration
├── index.js        # Application entry point
└── index.css       # Global styles
```


