import { AuthError, createSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// Simulated sign in. The citizen step accepts any valid mobile number and a 6-digit code;
// the officer step checks the demo credentials. Nothing sensitive is stored.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      role?: string;
      phone?: string;
      name?: string;
      officerId?: string;
      password?: string;
    } | null;
    if (!body?.role || (body.role !== "citizen" && body.role !== "officer")) {
      return Response.json({ error: "Unknown role" }, { status: 400 });
    }
    const { token, user } = await createSession(body.role, {
      phone: body.phone,
      name: body.name,
      officerId: body.officerId,
      password: body.password,
    });
    return Response.json({ token, user });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/auth/login]", err);
    return Response.json({ error: "Could not sign you in" }, { status: 503 });
  }
}
