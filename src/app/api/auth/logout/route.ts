import { destroySession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) await destroySession(token);
  return Response.json({ ok: true });
}
