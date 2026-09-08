import admin from 'firebase-admin';
import fs from 'node:fs';

const serviceAccountPath = process.argv[2];
const email = process.argv[3];
if (!serviceAccountPath || !email) {
  console.error('Usage: node set-admin-claim.mjs serviceAccount.json admin@email.com');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const user = await admin.auth().getUserByEmail(email);
await admin.auth().setCustomUserClaims(user.uid, { admin: true });
console.log(`Admin claim set for ${email}. Ask the user to sign out/in again.`);
await admin.app().delete();
