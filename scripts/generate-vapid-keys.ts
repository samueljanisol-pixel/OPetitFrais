/**
 * Génère une paire de clés VAPID pour Web Push.
 * Usage : npx tsx scripts/generate-vapid-keys.ts
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("Ajoutez ces variables à votre fichier .env :\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@opetitfrais.fr`);
