import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import {
  DEMO_CITIZEN,
  DEMO_OFFICER,
  isValidIndianMobile,
  isValidOfficerId,
  maskPhone,
  type Role,
  type SessionUser,
} from "@/lib/auth";

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// A stable id for a returning citizen, so their reports stay theirs across logins.
// The phone number itself is never stored: only a hash and a masked form.
function citizenId(phone: string) {
  return `c-${createHash("sha256").update(phone).digest("hex").slice(0, 12)}`;
}

export async function createSession(role: Role, payload: { phone?: string; name?: string; officerId?: string; password?: string }) {
  const token = randomUUID();
  let user: SessionUser;

  if (role === "citizen") {
    const phone = String(payload.phone ?? "").replace(/\D/g, "");
    if (!isValidIndianMobile(phone)) throw new AuthError(400, "That mobile number does not look right");
    const isDemo = phone === DEMO_CITIZEN.phone;
    const id = isDemo ? DEMO_CITIZEN.id : citizenId(phone);
    const name = payload.name?.trim() || (isDemo ? DEMO_CITIZEN.name : "Resident");
    user = { id, role: "citizen", name, phoneMasked: maskPhone(phone) };
    await db.insert(sessions).values({ id: token, userId: id, role: "citizen", name, phoneMasked: user.phoneMasked });
  } else {
    const officerId = String(payload.officerId ?? "").trim();
    const password = String(payload.password ?? "");
    if (!isValidOfficerId(officerId)) throw new AuthError(400, "Enter your Officer ID");
    if (officerId !== DEMO_OFFICER.officerId || password !== DEMO_OFFICER.password) {
      throw new AuthError(401, "Those officer details do not match");
    }
    user = { id: DEMO_OFFICER.id, role: "officer", name: DEMO_OFFICER.name, officerId: DEMO_OFFICER.officerId, title: DEMO_OFFICER.title };
    await db.insert(sessions).values({ id: token, userId: DEMO_OFFICER.id, role: "officer", name: DEMO_OFFICER.name, officerId: DEMO_OFFICER.officerId });
  }

  return { token, user };
}

export async function getSession(request: Request): Promise<SessionUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const [row] = await db.select().from(sessions).where(eq(sessions.id, token)).limit(1);
  if (!row) return null;
  return {
    id: row.userId,
    role: row.role as Role,
    name: row.name,
    phoneMasked: row.phoneMasked ?? undefined,
    officerId: row.officerId ?? undefined,
    title: row.role === "officer" ? DEMO_OFFICER.title : undefined,
  };
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, token));
}
