# Firebase Hosting Deployment Instructions

## Step 1: Login to Firebase CLI

Open your terminal and run:

```bash
firebase login
```

This will open a browser window where you can login with your Google account. Once logged in, return here.

## Step 2: Select or Create Firebase Project

Check if you want to use an existing project or create a new one:

```bash
# List available projects
firebase projects:list

# Use existing project (replace PROJECT_ID with your project ID)
firebase use PROJECT_ID

# OR create a new project
firebase projects:create YOUR_PROJECT_ID --display-name "Crypto Signal Checker"
firebase use YOUR_PROJECT_ID
```

The project ID is currently set to: `cryptosignalchecker`

## Step 3: Initialize Firebase Hosting (if not already done)

The project already has `firebase.json` configured. If you need to reinitialize:

```bash
firebase init hosting
```

Choose:
- Use an existing project
- Select your project
- Public directory: `build`
- Configure as a single-page app: Yes
- Set up automatic builds: No (optional)

## Step 4: Build and Deploy

```bash
# Build the React app (if not already built)
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

## Step 5: Access Your Deployed App

After successful deployment, you'll see a URL like:
```
https://YOUR_PROJECT_ID.web.app
```

Or:
```
https://YOUR_PROJECT_ID.firebaseapp.com
```

## Troubleshooting

- If you get authentication errors, make sure you're logged in: `firebase login`
- If project not found, check your project list: `firebase projects:list`
- To verify your project setup: `firebase use`

