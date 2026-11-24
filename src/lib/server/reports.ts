import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reportEvents, reportVotes, reports } from "@/db/schema";
import { buildSeed } from "@/lib/seed";
import {
  DAY_MS,
  ESCALATION_AT,
  ESCALATION_RANK,
  MAP_H,
  MAP_W,
  TEAM_FOR_CATEGORY,
  VERIFY_AT,
  derive,
  findSimilar,
  isCategory,
  nextStatus,
  type EscalationLevel,
  type EventKind,
  type ReportEvent,
  type ReportView,
  type Status,
  type Team,
} from "@/lib/ward";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Row = typeof reports.$inferSelect;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

// The reporter's identity is only ever returned to the reporter.
function toView(row: Row, viewerId?: string | null): ReportView {
  const mine = Boolean(viewerId && row.reporterId === viewerId);
  return {
    id: row.id,
    category: row.category as ReportView["category"],
    x: row.x,
    y: row.y,
    description: row.description,
    status: row.status as Status,
    votes: row.votes,
    reportCount: row.reportCount,
    photo: row.photo,
    afterPhoto: row.afterPhoto,
    resolution: row.resolution as ReportView["resolution"],
    reopenCount: row.reopenCount,
    team: (row.team as Team | null) ?? null,
    reporterId: mine ? row.reporterId : null,
    reporterName: mine ? row.reporterName : null,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: iso(row.verifiedAt),
    assignedAt: iso(row.assignedAt),
    resolvedAt: iso(row.resolvedAt),
    confirmedAt: iso(row.confirmedAt),
    reopenedAt: iso(row.reopenedAt),
  };
}

function toEvent(row: typeof reportEvents.$inferSelect): ReportEvent {
  return {
    id: row.id,
    reportId: row.reportId,
    kind: row.kind as EventKind,
    level: (row.level as EscalationLevel | null) ?? null,
    at: row.at.toISOString(),
  };
}

async function insertSeed() {
  const { reports: rows, events } = buildSeed(Date.now());
  await db
    .insert(reports)
    .values(
      rows.map((r) => ({
        id: r.id,
        category: r.category,
        x: r.x,
        y: r.y,
        description: r.description,
        status: r.status,
        votes: r.votes,
        reportCount: r.reportCount,
        photo: r.photo,
        afterPhoto: r.afterPhoto,
        resolution: r.resolution,
        reopenCount: r.reopenCount,
        team: r.team,
        reporterId: r.reporterId,
        reporterName: r.reporterName,
        createdAt: new Date(r.createdAt),
        verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
        assignedAt: r.assignedAt ? new Date(r.assignedAt) : null,
        resolvedAt: r.resolvedAt ? new Date(r.resolvedAt) : null,
        confirmedAt: r.confirmedAt ? new Date(r.confirmedAt) : null,
        reopenedAt: r.reopenedAt ? new Date(r.reopenedAt) : null,
      })),
    )
    .onConflictDoNothing();

  const ordered = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (ordered.length > 0) {
    await db
      .insert(reportEvents)
      .values(
        ordered.map((e) => ({
          reportId: e.reportId,
          kind: e.kind,
          level: e.level,
          at: new Date(e.at),
        })),
      )
      .onConflictDoNothing();
  }
}

export async function ensureSeeded() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(reports);
  if (count > 0) return false;
  await insertSeed();
  return true;
}

export async function resetDemo() {
  await db.delete(reports);
  await insertSeed();
}

async function logEvent(reportId: string, kind: EventKind, level: EscalationLevel | null = null, at = new Date()) {
  const [row] = await db.insert(reportEvents).values({ reportId, kind, level, at }).returning();
  return toEvent(row);
}

// Materialises escalation events for open issues that have climbed the ladder.
// Each rung is dated at the moment it was crossed.
async function syncEscalations(now = Date.now()) {
  const rows = await db.select().from(reports);
  const existing = await db.select().from(reportEvents);
  const ranked = new Map<string, number>();
  for (const e of existing) {
    if (e.kind !== "escalated" || !e.level) continue;
    const rank = ESCALATION_RANK[e.level as EscalationLevel] ?? 0;
    ranked.set(e.reportId, Math.max(ranked.get(e.reportId) ?? 0, rank));
  }
  const inserts: { reportId: string; kind: string; level: string; at: Date }[] = [];
  for (const row of rows) {
    const view = toView(row);
    if (view.status === "resolved") continue;
    const d = derive(view, now);
    const target = ESCALATION_RANK[d.escalation];
    const have = ranked.get(view.id) ?? 0;
    for (const [level, rank] of Object.entries(ESCALATION_RANK) as [EscalationLevel, number][]) {
      if (rank <= 0 || rank > target || rank <= have) continue;
      const at = new Date(Math.min(d.deadline + ESCALATION_AT[level as keyof typeof ESCALATION_AT] * DAY_MS, now));
      inserts.push({ reportId: view.id, kind: "escalated", level, at });
    }
  }
  if (inserts.length > 0) {
    await db.insert(reportEvents).values(inserts).onConflictDoNothing();
  }
  return inserts.length;
}

export type WardData = { reports: ReportView[]; events: ReportEvent[]; myVotes: string[] };

export async function listReports(viewerId?: string | null): Promise<WardData> {
  await ensureSeeded();
  await syncEscalations();
  const [rows, events, votes] = await Promise.all([
    db.select().from(reports).orderBy(desc(reports.createdAt)),
    db.select().from(reportEvents).orderBy(desc(reportEvents.at), desc(reportEvents.id)).limit(160),
    viewerId
      ? db.select({ reportId: reportVotes.reportId }).from(reportVotes).where(eq(reportVotes.voterId, viewerId))
      : Promise.resolve([]),
  ]);
  return {
    reports: rows.map((r) => toView(r, viewerId)),
    events: events.map(toEvent),
    myVotes: votes.map((v) => v.reportId),
  };
}

export async function getReport(id: string, viewerId?: string | null): Promise<ReportView> {
  const [row] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Report not found");
  return toView(row, viewerId);
}

export type NewReport = { id: unknown; category: unknown; x: unknown; y: unknown; description?: unknown; photo?: unknown };

function validPhoto(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const isData = v.startsWith("data:image/");
  const isPath = v.startsWith("/images/");
  if (!isData && !isPath) return null;
  if (isData && v.length > 260_000) throw new ApiError(413, "Photo is too large");
  return v;
}

export async function createReport(input: NewReport, user: { id: string; name: string }) {
  if (!/^[A-Za-z0-9-]{6,40}$/.test(String(input.id ?? ""))) throw new ApiError(400, "Invalid id");
  if (!isCategory(input.category)) throw new ApiError(400, "Unknown category");
  const x = Number(input.x);
  const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > MAP_W || y > MAP_H) {
    throw new ApiError(400, "Pin is outside Ward 14");
  }
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 500) : "";
  const photo = validPhoto(input.photo);

  // Duplicate guard: a nearby open report of the same category is returned instead of a new one.
  const open = (await db.select().from(reports).where(sql`${reports.status} <> 'resolved'`)).map((r) => toView(r));
  const similar = findSimilar(open, input.category, x, y);
  if (similar) {
    throw new ApiError(409, "Similar report nearby", { similar: similar.report, meters: Math.round(similar.meters) });
  }

  const [row] = await db
    .insert(reports)
    .values({
      id: String(input.id),
      category: input.category,
      x,
      y,
      description,
      photo,
      status: "reported",
      resolution: "none",
      reporterId: user.id,
      reporterName: user.name,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return { report: await getReport(String(input.id)), event: null };
  await logEvent(row.id, "created");
  return { report: toView(row, user.id), event: null };
}

// One vote per citizen per report: the primary key on report_votes enforces it.
export async function voteReport(id: string, voterId: string) {
  if (!/^[A-Za-z0-9-]{6,64}$/.test(voterId)) throw new ApiError(400, "Invalid voter");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Report not found");
    if (row.status === "resolved") throw new ApiError(409, "Report already resolved");
    const inserted = await tx
      .insert(reportVotes)
      .values({ reportId: id, voterId })
      .onConflictDoNothing()
      .returning({ voterId: reportVotes.voterId });
    if (inserted.length === 0) return { report: toView(row), alreadyVoted: true, event: null };
    let current = (
      await tx
        .update(reports)
        .set({ votes: sql`${reports.votes} + 1` })
        .where(eq(reports.id, id))
        .returning()
    )[0];
    let event: ReportEvent | null = null;
    if (current.status === "reported" && current.votes >= VERIFY_AT) {
      const at = new Date();
      [current] = await tx.update(reports).set({ status: "verified", verifiedAt: at }).where(eq(reports.id, id)).returning();
      const [ev] = await tx.insert(reportEvents).values({ reportId: id, kind: "verified", at }).returning();
      event = toEvent(ev);
    }
    return { report: toView(current), alreadyVoted: false, event };
  });
}

// The officer assigns work to a team. A report must be verified first.
export async function assignReport(id: string, team?: Team | null) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Report not found");
    if (row.status === "reported") throw new ApiError(409, "Needs 3 verifications before it can be assigned");
    if (row.status !== "verified") throw new ApiError(409, "Already assigned or resolved");
    const at = new Date();
    const chosen = team ?? (row.team as Team | null) ?? TEAM_FOR_CATEGORY[row.category as ReportView["category"]];
    const [updated] = await tx.update(reports).set({ status: "assigned", assignedAt: at, team: chosen }).where(eq(reports.id, id)).returning();
    const [ev] = await tx.insert(reportEvents).values({ reportId: id, kind: "assigned", at }).returning();
    return { report: toView(updated), event: toEvent(ev) };
  });
}

// Resolving requires an "after" photo: the fix must be visible, not just claimed.
export async function resolveReport(id: string, afterPhoto: unknown) {
  const photo = validPhoto(afterPhoto);
  if (!photo) throw new ApiError(400, "An after photo is required to resolve an issue");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Report not found");
    if (row.status !== "assigned") throw new ApiError(409, "Assign the issue before resolving it");
    const at = new Date();
    const [updated] = await tx
      .update(reports)
      .set({ status: "resolved", resolvedAt: at, afterPhoto: photo, resolution: "pending" })
      .where(eq(reports.id, id))
      .returning();
    const [ev] = await tx.insert(reportEvents).values({ reportId: id, kind: "resolved", at }).returning();
    return { report: toView(updated), event: toEvent(ev) };
  });
}

async function ownedRow(id: string, userId: string) {
  const [row] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Report not found");
  if (row.reporterId !== userId) throw new ApiError(403, "Only the person who reported this issue can close the loop");
  return row;
}

// The citizen closes the loop.
export async function confirmReport(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const row = await ownedRow(id, userId);
    if (row.status !== "resolved" || row.resolution !== "pending") throw new ApiError(409, "Nothing to confirm");
    const at = new Date();
    const [updated] = await tx
      .update(reports)
      .set({ resolution: "confirmed", confirmedAt: at })
      .where(eq(reports.id, id))
      .returning();
    const [ev] = await tx.insert(reportEvents).values({ reportId: id, kind: "confirmed", at }).returning();
    return { report: toView(updated), event: toEvent(ev) };
  });
}

// Reopen returns the issue to Assigned, adds +10 priority and is logged.
export async function reopenReport(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const row = await ownedRow(id, userId);
    if (row.status !== "resolved" || row.resolution !== "pending") throw new ApiError(409, "Only a resolved issue can be reopened");
    const at = new Date();
    const [updated] = await tx
      .update(reports)
      .set({ status: "assigned", resolution: "reopened", reopenCount: row.reopenCount + 1, reopenedAt: at, resolvedAt: null })
      .where(eq(reports.id, id))
      .returning();
    const [ev] = await tx.insert(reportEvents).values({ reportId: id, kind: "reopened", at }).returning();
    return { report: toView(updated), event: toEvent(ev) };
  });
}

export function nextStageHint(status: Status) {
  return nextStatus(status);
}

// CSV of open issues for the officer console.
export async function exportOpenCsv() {
  const rows = await db.select().from(reports);
  const head = ["report_id", "category", "team", "status", "priority_score", "level", "votes", "days_open", "sla_days", "overdue_days", "escalation", "created_at"];
  const lines = [head.join(",")];
  const now = Date.now();
  for (const row of rows) {
    const view = toView(row);
    if (view.status === "resolved") continue;
    const d = derive(view, now);
    lines.push(
      [
        view.id,
        view.category,
        view.team ?? "unassigned",
        view.status,
        d.score,
        d.level,
        view.votes,
        d.daysOpen,
        d.slaDays,
        d.overdueDays,
        d.escalation,
        view.createdAt,
      ].join(","),
    );
  }
  return lines.join("\n");
}
