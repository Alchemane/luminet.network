#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { randomBytes } = require("crypto");
const prisma = new PrismaClient();

(async () => {
  const id = process.argv[2] || `usr_${randomBytes(3).toString("hex")}`;
  const role = (process.argv[3] || "USER").toUpperCase();
  const cost = Number(process.argv[4] || 12);
  if (!["OWNER","ADMIN","USER"].includes(role)) { console.error("Role must be OWNER|ADMIN|USER"); process.exit(1); }

  const token = randomBytes(32).toString("base64url");
  const hash1 = bcrypt.hashSync(token, cost);
  const hash2 = bcrypt.hashSync(hash1, cost);

  const rec = await prisma.userCipher.create({ data: { id, role, hash2 } });
  console.log("=== GIVE THIS TO THE USER (their Lumen cipher) ===");
  console.log(hash1);
  console.log("\n=== SAVED IN DB ===");
  console.log({ id: rec.id, role: rec.role, createdAt: rec.createdAt.toISOString() });
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });