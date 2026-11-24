import { ApiError, assignReport, confirmReport, reopenReport, resolveReport, voteReport } from "@/lib/server/reports";
import { getSession } from "@/lib/server/session";
import { TEAMS, type Team } from "@/lib/ward";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message, ...(err.extra ?? {}) }, { status: err.status });
  }
  console.error("[api/reports/:id]", err);
  return Response.json({ error: "Database unavailable" }, { status: 503 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const session = await getSession(request);
    const { getReport } = await import("@/lib/server/reports");
    return Response.json({ report: await getReport(id, session?.id ?? null) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
}

// Actions. Vote and the close-the-loop actions belong to citizens; assign and resolve
// belong to ward officers. The role is checked on the server, not only in the interface.
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const session = await getSession(request);
    const body = (await request.json().catch(() => null)) as { action?: string; afterPhoto?: string; team?: string } | null;
    if (!session) throw new ApiError(401, "Log in to continue");

    switch (body?.action) {
      case "vote": {
        if (session.role !== "citizen") throw new ApiError(403, "Only a ward officer can do that");
        return Response.json(await voteReport(id, session.id));
      }
      case "assign": {
        if (session.role !== "officer") throw new ApiError(403, "Only a ward officer can do that");
        const team = TEAMS.includes(body?.team as Team) ? (body?.team as Team) : null;
        return Response.json(await assignReport(id, team));
      }
      case "resolve": {
        if (session.role !== "officer") throw new ApiError(403, "Only a ward officer can do that");
        return Response.json(await resolveReport(id, body?.afterPhoto));
      }
      case "confirm": {
        if (session.role !== "citizen") throw new ApiError(403, "Only the reporting citizen can do that");
        return Response.json(await confirmReport(id, session.id));
      }
      case "reopen": {
        if (session.role !== "citizen") throw new ApiError(403, "Only the reporting citizen can do that");
        return Response.json(await reopenReport(id, session.id));
      }
      default:
        throw new ApiError(400, "Unknown action");
    }
  } catch (err) {
    return fail(err);
  }
}
