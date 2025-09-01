const bcrypt = require("bcryptjs");
const { randomBytes } = require("crypto");

const cost = Number(process.argv[2] || 12);
const tokenRaw = randomBytes(32).toString("base64url");
const hash1 = bcrypt.hashSync(tokenRaw, cost);
const hash2 = bcrypt.hashSync(hash1, cost);

console.log("=== LOGIN_TOKEN (HASH1) — give this to the user ===");
console.log(hash1);
console.log("\n=== DB_HASH (HASH2) — store this in DB ===");
console.log(hash2);