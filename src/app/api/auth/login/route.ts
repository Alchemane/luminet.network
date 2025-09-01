import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { 
    return new Response("Invalid JSON", { status: 400 });
  }
  const cipher: string | undefined = body?.cipher ?? body?.token;
  if (!cipher) return new Response("Missing cipher", { status: 400 });

  // fetch all active ciphers
  const users = await prisma.userCipher.findMany({
    select: { id: true, role: true, hash2: true },
  });

  // compare against double hash
  for (const u of users) {
    if (await bcrypt.compare(cipher, u.hash2)) {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) return new Response("Server misconfig: JWT_SECRET missing.", { status: 500 });

      const token = jwt.sign({ sub: u.id, role: u.role }, jwtSecret, { expiresIn: "30d" });

      const res = NextResponse.json({ ok: true });
      res.cookies.set({
        name: process.env.COOKIE_NAME ?? "luminet_session",
        value: token,
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 30
      });
      return res;
    }
  }

  return new Response("Invalid cipher", { status: 401 });
}

export async function GET() {
  return NextResponse.json({ ok: false, hint: "POST { cipher: <hash1> }" }, { status: 405 });
}
