# Setting up push reminders

Push reminders send a notification at **8am UK time** on the day a note is due
(and once for anything overdue), even when the app is closed. The app code is
already live; these one-off steps switch on the server side.

Until they're done, reminders still work **while the app is open**.

## 1. Switch Firebase to the Blaze plan

1. Open the [Firebase console](https://console.firebase.google.com/) → **styx-notes**.
2. Bottom-left, next to "Spark", click **Upgrade** → choose **Blaze** → pick your card.
3. Set a **budget alert** when asked (e.g. £1). Blaze keeps the free allowance;
   one reminder job a day stays well inside it, so the expected cost is £0.

## 2. Create the Web Push key

1. Firebase console → ⚙ **Project settings** → **Cloud Messaging** tab.
2. Under **Web configuration → Web Push certificates**, click **Generate key pair**.
3. Copy the key (a long string starting with `B…`) and send it to Claude, or
   paste it into `index.html` as `FCM_VAPID_KEY` (done — the key is already set).
   It's a public key, so it's safe to commit.

## 3. Add the rules for device registrations

Firebase console → **Firestore Database** → **Rules**. Inside
`match /databases/{database}/documents { … }`, next to the existing
`match /notes/{noteId}` block, add:

```
match /pushTokens/{token} {
  allow create, update: if isAllowed() && request.resource.data.owner == request.auth.token.email;
  allow delete: if isAllowed() && resource.data.owner == request.auth.token.email;
}
```

Click **Publish**.

## 4. Deploy the reminder job (one time, on a computer)

You need [Node.js](https://nodejs.org/) (the LTS version) installed. Then, in a
terminal:

```
npm install -g firebase-tools
firebase login
git clone https://github.com/Befalamp/styx-notes.git
cd styx-notes/functions
npm install
cd ..
firebase deploy --only functions
```

If it asks to enable APIs (Cloud Functions, Cloud Scheduler, Cloud Build,
Artifact Registry), say yes. The first deploy takes a few minutes.

## 5. Turn it on for each device

Open the app on your phone and tap **🔔**. Allow notifications when asked. The
message should say reminders will arrive "even when the app is closed". Do this
once on each device you want reminders on.

## Checking it works

Give a note today's due date. The job runs at 8am, so to test sooner: Google
Cloud console → **Cloud Scheduler** → the `sendDueReminders` job → **Force run**.
Logs are under Firebase console → **Functions** → `sendDueReminders` → **Logs**.
