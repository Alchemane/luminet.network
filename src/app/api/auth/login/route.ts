import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { cipher } = await req.json();
  if (!cipher) return new Response("Missing cipher", { status: 400 });

  const users = await prisma.userCipher.findMany({
    where: { revokedAt: null },
    select: { id: true, role: true, hash2: true },
  });

  for (const u of users) {
    if (await bcrypt.compare(cipher, u.hash2)) {
      const token = signSession({ sub: u.id, role: u.role });
      setSessionCookie(token);
      return new Response("OK");
    }
  }

  return new Response("Invalid cipher", { status: 401 });
}