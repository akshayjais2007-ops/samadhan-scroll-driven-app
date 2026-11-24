// Shared domain logic for Samadhan. Used by API routes, the scroll story and the working app.
// Map units are metres on the Ward 14 plate (1600 x 900).

export const MAP_W = 1600;
export const MAP_H = 900;
export const DAY_MS = 86_400_000;

export const DUPLICATE_RADIUS = 125; // metres
export const CONTEXT_RADIUS = 100; // metres
export const CONTEXT_BOOST = 10;
export const CONTEXT_BOOST_CAP = 20;
export const DAYS_CAP = 10;
export const VERIFY_AT = 3;
export const HIGH_AT = 70;
export const MEDIUM_AT = 45;
export const REOPEN_BOOST = 10;

export const CATEGORIES = ["pothole", "garbage", "streetlight", "water"] as const;
export type Category = (typeof CATEGORIES)[number];

// Category weights drive the priority score; SLA days drive the deadline and escalation ladder.
export const CATEGORY_META: Record<Category, { weight: number; sla: number; en: string; hi: string }> = {
  pothole: { weight: 3, sla: 5, en: "Pothole", hi: "गड्ढा" },
  garbage: { weight: 2, sla: 2, en: "Garbage pile", hi: "कूड़े का ढेर" },
  streetlight: { weight: 2, sla: 3, en: "Dead streetlight", hi: "बंद स्ट्रीटलाइट" },
  water: { weight: 3, sla: 1, en: "Water leak", hi: "पानी का रिसाव" },
};

export const STATUSES = ["reported", "verified", "assigned", "resolved"] as const;
export type Status = (typeof STATUSES)[number];

// Citizen confirmation loop: pending means awaiting "Is it really fixed?".
export const RESOLUTIONS = ["none", "pending", "confirmed", "reopened"] as const;
export type ResolutionState = (typeof RESOLUTIONS)[number];

export type Level = "high" | "medium" | "low";
export type Tone = Level | "resolved";

export const ESCALATION_LEVELS = ["none", "ward", "zonal", "commissioner"] as const;
export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];
// Days past deadline that push an issue up each rung.
export const ESCALATION_AT: Record<Exclude<EscalationLevel, "none">, number> = { ward: 0, zonal: 3, commissioner: 6 };

export type EventKind = "created" | "verified" | "assigned" | "resolved" | "confirmed" | "reopened" | "escalated";

export const TEAMS = ["Roads", "Sanitation", "Electrical", "Water"] as const;
export type Team = (typeof TEAMS)[number];

// The team that normally handles each category. Used to auto-suggest an assignment.
export const TEAM_FOR_CATEGORY: Record<Category, Team> = {
  pothole: "Roads",
  garbage: "Sanitation",
  streetlight: "Electrical",
  water: "Water",
};

export type ReportView = {
  id: string;
  category: Category;
  x: number;
  y: number;
  description: string;
  status: Status;
  votes: number;
  reportCount: number;
  photo?: string | null;
  afterPhoto?: string | null;
  resolution: ResolutionState;
  reopenCount: number;
  team?: Team | null;
  reporterId?: string | null;
  reporterName?: string | null;
  createdAt: string;
  verifiedAt: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  confirmedAt: string | null;
  reopenedAt: string | null;
};

export type ReportEvent = { id: number; reportId: string; kind: EventKind; level: EscalationLevel | null; at: string };

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------ *
 * Identity master: landmarks of Ward 14.
 * The map draws these and the priority engine reads them, so the
 * geometry and the "near school" boost can never disagree.
 * ------------------------------------------------------------------ */

export type PoiKind = "park" | "school" | "market" | "bus" | "metro" | "hospital";
export type Poi = { kind: PoiKind; x: number; y: number; w: number; h: number; en: string; hi: string };

export const POIS: Poi[] = [
  { kind: "park", x: 180, y: 275, w: 220, h: 145, en: "City Park", hi: "सिटी पार्क" },
  { kind: "school", x: 880, y: 490, w: 150, h: 110, en: "Govt. School", hi: "सरकारी स्कूल" },
  { kind: "market", x: 1060, y: 285, w: 200, h: 120, en: "Main Market", hi: "मुख्य बाज़ार" },
  { kind: "bus", x: 990, y: 386, w: 46, h: 24, en: "Bus Stop", hi: "बस स्टॉप" },
  { kind: "hospital", x: 1100, y: 128, w: 165, h: 108, en: "Hospital", hi: "अस्पताल" },
  { kind: "metro", x: 1392, y: 540, w: 40, h: 40, en: "Metro Station", hi: "मेट्रो स्टेशन" },
];

// Landmarks that raise an issue's context boost.
export const BOOST_KINDS: readonly PoiKind[] = ["school", "bus", "metro", "hospital"];

// Streetlight poles, part of the identity master. In the dark theme the ward reads as
// night: working poles glow and poles reported dead stay dark.
export const STREETLIGHTS: [number, number][] = [
  [280, 415], [500, 415], [720, 415], [880, 415], [1240, 415],
  [350, 238], [800, 238], [1250, 238],
  [400, 628], [900, 628], [1350, 628],
  [1285, 300], [1285, 500], [1285, 700],
  [685, 200], [685, 600],
];

export const DEAD_LIGHT_RADIUS = 45;

function distToRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function nearbyPois(x: number, y: number) {
  return POIS.filter((p) => (BOOST_KINDS as readonly string[]).includes(p.kind) && distToRect(x, y, p) <= CONTEXT_RADIUS);
}

export function contextBoostFor(x: number, y: number) {
  return Math.min(nearbyPois(x, y).length * CONTEXT_BOOST, CONTEXT_BOOST_CAP);
}

/* ------------------------------------------------------------------ *
 * Priority
 * ------------------------------------------------------------------ */

export type PriorityParts = {
  category: number;
  neighbours: number;
  days: number;
  context: number;
  reopened: number;
  near: Poi[];
  total: number;
};

export function priorityParts(r: Pick<ReportView, "category" | "votes" | "x" | "y" | "reopenCount">, daysOpen: number): PriorityParts {
  const near = nearbyPois(r.x, r.y);
  const context = Math.min(near.length * CONTEXT_BOOST, CONTEXT_BOOST_CAP);
  const parts = {
    category: CATEGORY_META[r.category].weight * 10,
    neighbours: r.votes * 3,
    days: Math.min(Math.max(daysOpen, 0), DAYS_CAP) * 3,
    context,
    reopened: r.reopenCount > 0 ? REOPEN_BOOST : 0,
    near,
  };
  return { ...parts, total: parts.category + parts.neighbours + parts.days + parts.context + parts.reopened };
}

export function levelFor(score: number): Level {
  if (score >= HIGH_AT) return "high";
  if (score >= MEDIUM_AT) return "medium";
  return "low";
}

export function nextStatus(s: Status): Status | null {
  const i = STATUSES.indexOf(s);
  return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
}

export function stageIndex(s: Status) {
  return STATUSES.indexOf(s);
}

export function escalationFor(overdueDays: number): EscalationLevel {
  if (overdueDays < 0) return "none";
  if (overdueDays <= 2) return "ward";
  if (overdueDays <= 5) return "zonal";
  return "commissioner";
}

export const ESCALATION_RANK: Record<EscalationLevel, number> = { none: 0, ward: 1, zonal: 2, commissioner: 3 };

export type Derived = ReturnType<typeof derive>;

// Read-only facts about a report at an instant.
export function derive(r: ReportView, now: number) {
  const created = Date.parse(r.createdAt);
  const resolved = r.resolvedAt ? Date.parse(r.resolvedAt) : null;
  const slaDays = CATEGORY_META[r.category].sla;
  const deadline = created + slaDays * DAY_MS;
  const isResolved = r.status === "resolved";
  const closed = isResolved && r.resolution === "confirmed";
  const daysOpen = isResolved && resolved ? (resolved - created) / DAY_MS : (now - created) / DAY_MS;
  const overdueDays = isResolved ? -1 : Math.floor((now - deadline) / DAY_MS);
  const parts = priorityParts(r, Math.floor(daysOpen));
  const overdue = !isResolved && now > deadline;
  return {
    created,
    deadline,
    slaDays,
    isResolved,
    closed,
    daysOpen: Math.max(0, Math.floor(daysOpen)),
    overdueDays: Math.max(0, overdueDays),
    overdue,
    resolvedLate: isResolved && resolved !== null && resolved > deadline,
    fixDays: isResolved && resolved ? (resolved - created) / DAY_MS : null,
    score: parts.total,
    parts,
    level: levelFor(parts.total),
    tone: (isResolved ? "resolved" : levelFor(parts.total)) as Tone,
    escalation: escalationFor(overdueDays),
    awaitingConfirmation: isResolved && r.resolution === "pending",
  };
}

/* ------------------------------------------------------------------ *
 * Summaries
 * ------------------------------------------------------------------ */

export function summarize(reports: ReportView[], now: number) {
  let open = 0;
  let resolved = 0;
  let awaiting = 0;
  let pastDeadline = 0;
  let escalated = 0;
  let reopened = 0;
  let fixTotal = 0;
  const byCategory: Record<Category, number> = { pothole: 0, garbage: 0, streetlight: 0, water: 0 };
  for (const r of reports) {
    const d = derive(r, now);
    if (r.status === "resolved") {
      resolved++;
      fixTotal += d.fixDays ?? 0;
      if (d.awaitingConfirmation) awaiting++;
    } else {
      open++;
      byCategory[r.category]++;
    }
    if (r.status !== "resolved") {
      if (d.overdue) pastDeadline++;
      // Escalated counts issues that climbed past the ward officer, so it stays distinct
      // from pastDeadline (which counts every overdue issue).
      if (ESCALATION_RANK[d.escalation] > ESCALATION_RANK.ward) escalated++;
    }
    if (r.reopenCount > 0) reopened++;
  }
  const avgFixDays = resolved ? Math.round((fixTotal / resolved) * 10) / 10 : 0;
  return { total: reports.length, open, resolved, awaiting, avgFixDays, pastDeadline, escalated, reopened, byCategory };
}

/* ------------------------------------------------------------------ *
 * Duplicate detection
 * ------------------------------------------------------------------ */

export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export function findSimilar(reports: ReportView[], category: Category, x: number, y: number) {
  let best: { report: ReportView; meters: number } | null = null;
  for (const r of reports) {
    if (r.category !== category || r.status === "resolved") continue;
    const m = distance(r.x, r.y, x, y);
    if (m <= DUPLICATE_RADIUS && (!best || m < best.meters)) best = { report: r, meters: m };
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

const ORIGIN_LAT = 28.62;
const ORIGIN_LNG = 77.2;
export function geotag(x: number, y: number) {
  const lat = ORIGIN_LAT + (MAP_H - y) / 110574;
  const lng = ORIGIN_LNG + x / 97660;
  return { lat, lng, label: `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E` };
}

export function shortId(id: string) {
  return id.replace(/^WR14-/, "#");
}

// Clusters reports on a 120 m grid to find places where the same fault keeps recurring.
export function hotspots(reports: ReportView[]) {
  const cells = new Map<string, { x: number; y: number; items: ReportView[] }>();
  for (const r of reports) {
    const key = `${Math.round(r.x / 120)}:${Math.round(r.y / 120)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.items.push(r);
      cell.x = (cell.x * (cell.items.length - 1) + r.x) / cell.items.length;
      cell.y = (cell.y * (cell.items.length - 1) + r.y) / cell.items.length;
    } else {
      cells.set(key, { x: r.x, y: r.y, items: [r] });
    }
  }
  return [...cells.values()]
    .filter((c) => c.items.length > 1)
    .map((c) => ({
      x: c.x,
      y: c.y,
      count: c.items.length,
      ids: c.items.map((i) => i.id),
      categories: [...new Set(c.items.map((i) => i.category))],
    }))
    .sort((a, b) => b.count - a.count);
}

// The nearest landmark, used to give a hotspot a name a resident would recognise.
export function nearestLandmark(x: number, y: number, lang: "en" | "hi") {
  let best: { poi: Poi; d: number } | null = null;
  for (const poi of POIS) {
    const d = distToRect(x, y, poi);
    if (!best || d < best.d) best = { poi, d };
  }
  if (!best) return "";
  return lang === "hi" ? best.poi.hi : best.poi.en;
}
