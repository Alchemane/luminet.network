// scripts/mint-bcryptish-cipher.mjs
import bcrypt from "bcryptjs";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LEN = Number(process.argv[2] || 40);

// step 1: random token (user never sees this)
function randomToken(len = LEN) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

const token = randomToken();

// step 2: REAL bcrypt of the random token -> this 60-char string looks like bcrypt
const hash1 = bcrypt.hashSync(token, 12); // e.g. $2b$12$...

// step 3: store bcrypt(hash1) in .env
const hash2 = bcrypt.hashSync(hash1, 12);

console.log("PLAINTEXT_CIPHER (give this to users; it looks like bcrypt):");
console.log(hash1);
console.log("\nPut this in your .env as LUMEN_CIPHER_HASH:");
console.log(hash2);