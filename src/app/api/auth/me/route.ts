import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// Validates a stored token on load, so a stale session never leaves the UI signed in.
export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: session });
}
