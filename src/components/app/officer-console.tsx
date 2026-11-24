"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { notify } from "@/components/app/toaster";
import { sessionToken } from "@/lib/auth";
import { escKey } from "@/components/app/live-map";
import { useLang } from "@/components/lang-provider";
import { CategoryGlyph, PriorityChips, TONE_VAR, toneLabelKey } from "@/components/ward/pin";
import { WardSvg } from "@/components/ward/ward-map";
import { compressPhoto } from "@/lib/photo";
import { translate, type Key, type Lang } from "@/lib/i18n";
import {
  CATEGORIES,
  CATEGORY_META,
  DAY_MS,
  ESCALATION_RANK,
  TEAM_FOR_CATEGORY,
  TEAMS,
  derive,
  hotspots,
  nearestLandmark,
  summarize,
  type Category,
  type EscalationLevel,
  type ReportView,
  type Team,
} from "@/lib/ward";

type ActionResult = "ok" | "queued" | "rejected" | "missing";
type TFn = (key: Key, vars?: Record<string, string | number>) => string;

// The officer console: one queue, sorted by score, with the actions that move an issue on.
export function OfficerConsole({
  reports,
  now,
  onAssign,
  onResolve,
}: {
  reports: ReportView[];
  now: number;
  onAssign: (id: string, team: Team) => ActionResult;
  onResolve: (id: string, afterPhoto: string) => ActionResult;
}): ReactNode {
  const { t, lang } = useLang();
  const { session } = useAuth();
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<"all" | "open" | "resolved">("open");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [level, setLevel] = useState<EscalationLevel | "all">("all");
  const [team, setTeam] = useState<Team | "all">("all");
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tf = useMemo(() => translate.bind(null, lang) as TFn, [lang]);
  const s = summarize(reports, now);

  const queue = useMemo(
    () =>
      reports
        .filter((r) => {
          const d = derive(r, now);
          if (status === "open" && r.status === "resolved") return false;
          if (status === "resolved" && r.status !== "resolved") return false;
          if (category !== "all" && r.category !== category) return false;
          if (overdueOnly && !d.overdue) return false;
          if (level !== "all" && d.escalation !== level) return false;
          if (team !== "all" && (r.team ?? null) !== team) return false;
          return true;
        })
        .map((r) => ({ r, d: derive(r, now) }))
        .sort((a, b) => Number(b.d.overdue) - Number(a.d.overdue) || b.d.score - a.d.score),
    [reports, now, category, status, overdueOnly, level, team],
  );

  const dueToday = reports.filter((r) => {
    if (r.status === "resolved") return false;
    const d = derive(r, now);
    const left = d.deadline - now;
    return left <= DAY_MS && left > 0;
  }).length;

  const reopenRate = s.total > 0 ? Math.round((s.reopened / s.total) * 100) : 0;

  const workload = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const r of reports) {
      if (r.status === "resolved") continue;
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return CATEGORIES.map((c) => ({ category: c, n: counts.get(c) ?? 0, pct: ((counts.get(c) ?? 0) / max) * 100 }));
  }, [reports]);

  const spots = useMemo(() => hotspots(reports).slice(0, 4), [reports]);

  const tiles: { label: string; value: string }[] = [
    { label: t("oc.open"), value: String(s.open) },
    { label: t("oc.dueToday"), value: String(dueToday) },
    { label: t("oc.overdue"), value: String(s.pastDeadline) },
    { label: t("oc.escalated"), value: String(s.escalated) },
    { label: t("oc.avgFix"), value: `${s.avgFixDays.toFixed(1)} ${t("unit.days")}` },
    { label: t("oc.reopenRate"), value: `${reopenRate}%` },
  ];

  const exportCsv = async () => {
    try {
      const res = await fetch("/api/export", { headers: { Authorization: `Bearer ${sessionToken()}` }, cache: "no-store" });
      if (!res.ok) {
        notify(t("error.generic"));
        return;
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ward-14-open-issues.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify(t("error.generic"));
    }
  };

  const pickAfterPhoto = async (file: File | undefined) => {
    const id = resolveTarget;
    setResolveTarget(null);
    if (!file || !id) return;
    const data = await compressPhoto(file);
    if (!data) {
      notify(t("report.tooLarge"));
      return;
    }
    const result = onResolve(id, data);
    notify(result === "rejected" ? t("toast.needAfterPhoto") : result === "missing" ? t("error.generic") : t("toast.resolved"));
  };

  const ladder = (d: ReturnType<typeof derive>) => {
    const steps: { key: Key; rank: number }[] = [
      { key: "oc.ladder1", rank: ESCALATION_RANK.ward },
      { key: "oc.ladder2", rank: ESCALATION_RANK.zonal },
      { key: "oc.ladder3", rank: ESCALATION_RANK.commissioner },
    ];
    const current = ESCALATION_RANK[d.escalation];
    return (
      <ol className="flex items-center gap-1">
        {steps.map((step, i) => (
          <li key={step.key} className="flex flex-1 items-center gap-1">
            <span
              className={`h-2 flex-1 rounded-full ${current >= step.rank ? "bg-[var(--high)]" : "bg-[var(--rule)]"}`}
              aria-hidden="true"
            />
            <span className={`text-[10px] font-bold ${current >= step.rank ? "text-[var(--ink)]" : "text-[var(--ink-mute)]"}`}>{t(step.key)}</span>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--rule)] pb-6">
        <div>
          <p className="kicker">{t("oc.title")}</p>
          <h3 className="display-sm mt-2">{t("oc.ward")}</h3>
          {session?.name && (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              {session.name}
              {session.title ? ` · ${session.title}` : ""}
            </p>
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>
          {t("oc.export")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{tile.label}</p>
            <p className="num mt-2 text-3xl font-bold text-[var(--ink)]">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="oc-queue">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h4 id="oc-queue" className="text-lg font-bold text-[var(--ink)]">
              {t("oc.queue")}
            </h4>
            <p className="text-sm text-[var(--ink-mute)]">{t("dash.officerHint")}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <select
              aria-label={t("oc.allCategories")}
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | "all")}
              className="min-h-11 border-2 border-[var(--ink)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
            >
              <option value="all">{t("oc.allCategories")}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c][lang]}
                </option>
              ))}
            </select>
            <select
              aria-label={t("oc.allStatuses")}
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | "open" | "resolved")}
              className="min-h-11 border-2 border-[var(--ink)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
            >
              <option value="all">{t("oc.allStatuses")}</option>
              <option value="open">{t("map.open")}</option>
              <option value="resolved">{t("map.resolved")}</option>
            </select>
            <select
              aria-label={t("oc.allTeams")}
              value={team}
              onChange={(e) => setTeam(e.target.value as Team | "all")}
              className="min-h-11 border-2 border-[var(--ink)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
            >
              <option value="all">{t("oc.allTeams")}</option>
              {TEAMS.map((tm) => (
                <option key={tm} value={tm}>
                  {t(`team.${tm}` as Key)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("oc.allLevels")}
              value={level}
              onChange={(e) => setLevel(e.target.value as EscalationLevel | "all")}
              className="min-h-11 border-2 border-[var(--ink)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
            >
              <option value="all">{t("oc.allLevels")}</option>
              <option value="ward">{t("esc.ward")}</option>
              <option value="zonal">{t("esc.zonal")}</option>
              <option value="commissioner">{t("esc.commissioner")}</option>
            </select>
            <button
              type="button"
              aria-pressed={overdueOnly}
              className={`btn btn-sm ${overdueOnly ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setOverdueOnly((v) => !v)}
            >
              {t("oc.overdueOnly")}
            </button>
          </div>

          {queue.length === 0 ? (
            <p className="mt-6 border-2 border-dashed border-[var(--rule)] p-5 text-sm text-[var(--ink-soft)]">{t("oc.empty")}</p>
          ) : (
            <ul className="mt-5 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
              {queue.map(({ r, d }) => {
                const suggested = TEAM_FOR_CATEGORY[r.category];
                return (
                  <li key={r.id} className="py-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[var(--ink)] bg-[var(--surface)]">
                        <svg viewBox="4 2.5 24 24" width="20" height="20" aria-hidden="true">
                          <CategoryGlyph category={r.category} />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[var(--ink)]">
                          {CATEGORY_META[r.category][lang]} · <span className="num">{r.id}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ink-mute)]">{r.description}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-[var(--ink)]">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TONE_VAR[d.tone] }} aria-hidden="true" />
                        {t(toneLabelKey(d.tone))} <span className="num">{d.score}</span>
                      </span>
                    </div>

                    <div className="mt-3">
                      <PriorityChips parts={d.parts} score={d.score} lang={lang} compact />
                    </div>

                    <div className="mt-3">{ladder(d)}</div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {r.status === "verified" && (
                        <select
                          aria-label={t("detail.team")}
                          value={r.team ?? suggested}
                          onChange={(e) => {
                            const result = onAssign(r.id, e.target.value as Team);
                            notify(result === "rejected" ? t("toast.needVerify") : result === "missing" ? t("error.generic") : t("toast.assigned"));
                          }}
                          className="min-h-11 border-2 border-[var(--ink)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
                        >
                          {TEAMS.map((tm) => (
                            <option key={tm} value={tm}>
                              {t(`team.${tm}` as Key)}
                              {tm === suggested ? ` (${t("oc.suggested")})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      {r.status === "verified" && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const result = onAssign(r.id, r.team ?? suggested);
                            notify(result === "rejected" ? t("toast.needVerify") : result === "missing" ? t("error.generic") : t("toast.assigned"));
                          }}
                        >
                          {t("oc.assignTeam", { team: t(`team.${r.team ?? suggested}` as Key) })}
                        </button>
                      )}
                      {r.status === "assigned" && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setResolveTarget(r.id);
                            fileRef.current?.click();
                          }}
                        >
                          {t("oc.resolve")}
                        </button>
                      )}
                      {r.status === "reported" && <span className="badge-soft">{t("detail.needVerify", { n: 3 })}</span>}
                      {r.status === "resolved" && <span className="badge-verified">✓ {t("stage.resolved")}</span>}
                      {d.escalation !== "none" && (
                        <span className="badge-esc" data-level="high">
                          {t(escKey(d.escalation))}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void pickAfterPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </section>

        <div className="space-y-10">
          <section aria-labelledby="oc-map">
            <h4 id="oc-map" className="text-lg font-bold text-[var(--ink)]">
              {t("oc.ward")}
            </h4>
            <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden border-2 border-[var(--ink)] bg-[var(--paper)]">
              <WardSvg deadLights={reports.filter((r) => r.category === "streetlight" && r.status !== "resolved").map((r) => ({ x: r.x, y: r.y }))} />
            </div>
          </section>

          <section aria-labelledby="oc-workload">
            <h4 id="oc-workload" className="text-lg font-bold text-[var(--ink)]">
              {t("oc.workload")}
            </h4>
            <ul className="mt-4 space-y-4">
              {workload.map((w) => (
                <li key={w.category} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3">
                  <span className="text-sm font-bold text-[var(--ink)]">{CATEGORY_META[w.category][lang]}</span>
                  <span className="h-4 bg-[var(--rule)]" aria-hidden="true">
                    <span className="block h-full bg-[var(--ink)]" style={{ width: `${w.pct}%` }} />
                  </span>
                  <span className="num text-right text-sm font-bold text-[var(--ink)]">{w.n}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="oc-hotspots">
            <h4 id="oc-hotspots" className="text-lg font-bold text-[var(--ink)]">
              {t("oc.hotspots")}
            </h4>
            {spots.length === 0 ? (
              <p className="mt-4 border-2 border-dashed border-[var(--rule)] p-5 text-sm text-[var(--ink-soft)]">{t("oc.hotspotsEmpty")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
                {spots.map((spot) => (
                  <li key={`${spot.x}-${spot.y}`} className="flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-[var(--ink)]">{nearestLandmark(spot.x, spot.y, lang)}</span>
                      <span className="num block text-xs text-[var(--ink-mute)]">{spot.ids.join(", ")}</span>
                    </span>
                    <span className="num shrink-0 text-lg font-bold text-[var(--ink)]">×{spot.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
