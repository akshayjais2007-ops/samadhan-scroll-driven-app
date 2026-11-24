import { ApiError, createReport, listReports } from "@/lib/server/reports";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message, ...(err.extra ?? {}) }, { status: err.status });
  }
  console.error("[api/reports]", err);
  return Response.json({ error: "Database unavailable" }, { status: 503 });
}

// Anyone may read the ward. The session only changes what is personalised:
// a reporter's own name and the reports they have already voted on.
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    const data = await listReports(session?.id ?? null);
    return Response.json({ ...data, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
}

// Reporting requires a signed-in citizen.
export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) throw new ApiError(401, "Log in to report an issue");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new ApiError(400, "Invalid JSON");
    const { report } = await createReport(
      {
        id: body.id,
        category: body.category,
        x: body.x,
        y: body.y,
        description: body.description,
        photo: body.photo,
      },
      { id: session.id, name: session.name },
    );
    return Response.json({ report }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
