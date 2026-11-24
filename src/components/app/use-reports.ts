"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SESSION_KEY } from "@/lib/auth";
import { buildSeed } from "@/lib/seed";
import { KEYS, readJSON, writeJSON } from "@/lib/storage";
import { TEAM_FOR_CATEGORY, VERIFY_AT, type EventKind, type ReportEvent, type ReportView, type Team } from "@/lib/ward";

export type SyncState = "loading" | "live" | "offline";
export type VoteResult = "counted" | "already" | "closed" | "missing";
export type ActionResult = "ok" | "queued" | "rejected" | "missing";

// Offline-first: every change applies locally at once, queues in localStorage, and syncs
// when the ward API answers. 5xx and network failures keep the operation queued.
type Pending =
  | { kind: "create"; report: ReportView }
  | { kind: "vote"; id: string }
  | { kind: "assign"; id: string; team: Team }
  | { kind: "resolve"; id: string; afterPhoto: string }
  | { kind: "confirm"; id: string }
  | { kind: "reopen"; id: string };

const TIMEOUT_MS = 8000;
const POLL_MS = 20000;

function token() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? "";
  } catch {
    return "";
  }
}

async function request(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const auth = token();
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: { ...(init?.headers ?? {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function send(op: Pending) {
  const headers = { "Content-Type": "application/json" };
  if (op.kind === "create") {
    const r = op.report;
    return request("/api/reports", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: r.id, category: r.category, x: r.x, y: r.y, description: r.description, photo: r.photo ?? undefined }),
    });
  }
  const bodies: Record<string, unknown> = {
    vote: { action: "vote" },
    assign: { action: "assign", team: op.kind === "assign" ? op.team : undefined },
    resolve: { action: "resolve", afterPhoto: op.kind === "resolve" ? op.afterPhoto : undefined },
    confirm: { action: "confirm" },
    reopen: { action: "reopen" },
  };
  return request(`/api/reports/${encodeURIComponent(op.id)}`, { method: "PATCH", headers, body: JSON.stringify(bodies[op.kind]) });
}

function localEventId() {
  return -Date.now() - Math.floor(Math.random() * 100);
}

function event(reportId: string, kind: EventKind, extra: Partial<ReportEvent> = {}): ReportEvent {
  return { id: localEventId(), reportId, kind, level: null, at: new Date().toISOString(), ...extra };
}

export function useReports() {
  const [reports, setReports] = useState<ReportView[]>([]);
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [myVotes, setMyVotes] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>("loading");
  const [pendingCount, setPendingCount] = useState(0);
  const pendingRef = useRef<Pending[]>([]);
  const flushingRef = useRef<Promise<boolean> | null>(null);
  const reportsRef = useRef<ReportView[]>([]);
  const votesRef = useRef<string[]>([]);

  // Mirrored in an effect so the ref is never written during render.
  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);
  useEffect(() => {
    votesRef.current = myVotes;
  }, [myVotes]);

  const savePending = useCallback(() => {
    writeJSON(KEYS.pending, pendingRef.current);
    setPendingCount(pendingRef.current.length);
  }, []);

  const runQueue = useCallback(async (): Promise<boolean> => {
    try {
      while (pendingRef.current.length > 0) {
        const res = await send(pendingRef.current[0]);
        if (res.status >= 500 || res.status === 401) throw new Error("server");
        pendingRef.current = pendingRef.current.slice(1);
        savePending();
      }
      setSync("live");
      return true;
    } catch {
      setSync("offline");
      return false;
    }
  }, [savePending]);

  const flush = useCallback((): Promise<boolean> => {
    if (flushingRef.current) return flushingRef.current;
    const p = runQueue();
    flushingRef.current = p;
    void p.finally(() => {
      if (flushingRef.current === p) flushingRef.current = null;
    });
    return p;
  }, [runQueue]);

  const refresh = useCallback(async () => {
    const ok = await flush();
    if (!ok) return;
    try {
      const res = await request("/api/reports");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reports: ReportView[]; events: ReportEvent[]; myVotes?: string[] };
      setReports(data.reports);
      setEvents(data.events);
      if (data.myVotes) setMyVotes(data.myVotes);
      setSync("live");
    } catch {
      setSync("offline");
    }
  }, [flush]);

  // Boot: cache first for an instant paint, then reconcile with the ward server.
  useEffect(() => {
    const cachedReports = readJSON<ReportView[]>(KEYS.reports, []);
    const cachedEvents = readJSON<ReportEvent[]>(KEYS.events, []);
    pendingRef.current = readJSON<Pending[]>(KEYS.pending, []);
    setPendingCount(pendingRef.current.length);
    if (cachedReports.length > 0) {
      setReports(cachedReports);
      setEvents(cachedEvents);
    } else {
      const seed = buildSeed(Date.now());
      setReports(seed.reports);
      setEvents(seed.events);
    }
    setReady(true);
    void refresh();
    const onOnline = () => void refresh();
    const timer = window.setInterval(() => {
      if (pendingRef.current.length > 0) void refresh();
    }, POLL_MS);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [refresh]);

  // Cache without photos so localStorage stays small.
  useEffect(() => {
    if (!ready) return;
    const strip = (r: ReportView) => ({
      ...r,
      photo: r.photo?.startsWith("data:") ? null : r.photo,
      afterPhoto: r.afterPhoto?.startsWith("data:") ? null : r.afterPhoto,
    });
    writeJSON(KEYS.reports, reports.map(strip));
    writeJSON(KEYS.events, events.slice(0, 80));
  }, [reports, events, ready]);

  const enqueue = (op: Pending): Promise<boolean> => {
    pendingRef.current = [...pendingRef.current, op];
    savePending();
    return flush();
  };

  const apply = (id: string, patch: (r: ReportView) => ReportView) => {
    setReports((prev) => prev.map((r) => (r.id === id ? patch(r) : r)));
  };

  const vote = (id: string): VoteResult => {
    const target = reportsRef.current.find((r) => r.id === id);
    if (!target) return "missing";
    if (target.status === "resolved") return "closed";
    // One person cannot verify the same report twice.
    if (votesRef.current.includes(id)) return "already";
    const promote = target.status === "reported" && target.votes + 1 >= VERIFY_AT;
    setMyVotes((prev) => [...prev, id]);
    apply(id, (r) => ({
      ...r,
      votes: r.votes + 1,
      status: promote ? "verified" : r.status,
      verifiedAt: promote ? new Date().toISOString() : r.verifiedAt,
    }));
    if (promote) setEvents((prev) => [event(id, "verified"), ...prev]);
    void enqueue({ kind: "vote", id });
    return "counted";
  };

  const assign = (id: string, team: Team): ActionResult => {
    const target = reportsRef.current.find((r) => r.id === id);
    if (!target) return "missing";
    if (target.status !== "verified") return "rejected";
    apply(id, (r) => ({ ...r, status: "assigned", assignedAt: new Date().toISOString(), team }));
    setEvents((prev) => [event(id, "assigned"), ...prev]);
    void enqueue({ kind: "assign", id, team });
    return "ok";
  };

  const resolve = (id: string, afterPhoto: string): ActionResult => {
    const target = reportsRef.current.find((r) => r.id === id);
    if (!target) return "missing";
    if (target.status !== "assigned") return "rejected";
    const at = new Date().toISOString();
    apply(id, (r) => ({ ...r, status: "resolved", resolvedAt: at, afterPhoto, resolution: "pending" }));
    setEvents((prev) => [event(id, "resolved"), ...prev]);
    void enqueue({ kind: "resolve", id, afterPhoto });
    return "ok";
  };

  const confirm = (id: string): ActionResult => {
    const target = reportsRef.current.find((r) => r.id === id);
    if (!target) return "missing";
    if (target.status !== "resolved" || target.resolution !== "pending") return "rejected";
    if (target.reporterId && target.reporterId !== currentUserId()) return "rejected";
    apply(id, (r) => ({ ...r, resolution: "confirmed", confirmedAt: new Date().toISOString() }));
    setEvents((prev) => [event(id, "confirmed"), ...prev]);
    void enqueue({ kind: "confirm", id });
    return "ok";
  };

  const reopen = (id: string): ActionResult => {
    const target = reportsRef.current.find((r) => r.id === id);
    if (!target) return "missing";
    if (target.status !== "resolved" || target.resolution !== "pending") return "rejected";
    if (target.reporterId && target.reporterId !== currentUserId()) return "rejected";
    apply(id, (r) => ({
      ...r,
      status: "assigned",
      resolution: "reopened",
      reopenCount: r.reopenCount + 1,
      reopenedAt: new Date().toISOString(),
      resolvedAt: null,
    }));
    setEvents((prev) => [event(id, "reopened"), ...prev]);
    void enqueue({ kind: "reopen", id });
    return "ok";
  };

  const create = async (report: ReportView): Promise<boolean> => {
    setReports((prev) => [report, ...prev]);
    setEvents((prev) => [event(report.id, "created"), ...prev]);
    const synced = await enqueue({ kind: "create", report });
    if (synced) void refresh();
    return synced;
  };

  const reset = async (): Promise<boolean> => {
    try {
      const res = await request("/api/seed", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reports: ReportView[]; events: ReportEvent[] };
      pendingRef.current = [];
      savePending();
      setReports(data.reports);
      setEvents(data.events);
      setSync("live");
      return true;
    } catch {
      const seed = buildSeed(Date.now());
      setReports(seed.reports);
      setEvents(seed.events);
      setSync("offline");
      return false;
    }
  };

  return { reports, events, myVotes, ready, sync, pendingCount, vote, assign, resolve, confirm, reopen, create, reset, refresh };
}

// The signed-in citizen id, read from the stored session.
function currentUserId() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { user?: { id?: string } };
    return parsed.user?.id ?? "";
  } catch {
    return "";
  }
}

export { TEAM_FOR_CATEGORY };
