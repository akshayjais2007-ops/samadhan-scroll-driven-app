import { exportOpenCsv } from "@/lib/server/reports";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// CSV of open issues. Officers only.
export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session || session.role !== "officer") {
    return Response.json({ error: "Only a ward officer can export" }, { status: 403 });
  }
  const csv = await exportOpenCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ward-14-open-issues.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
