"use client";

import { useMemo, type ReactNode } from "react";
import { useLang } from "@/components/lang-provider";
import { CategoryGlyph, TONE_VAR, toneLabelKey } from "@/components/ward/pin";
import { useAuth } from "@/components/auth/auth-provider";
import {
  CATEGORIES,
  CATEGORY_META,
  derive,
  hotspots,
  nearestLandmark,
  summarize,
  type ReportView,
} from "@/lib/ward";
import type { Key } from "@/lib/i18n";

// Ward stats: public, read only, no login needed to read.
export function WardStats({ reports, now }: { reports: ReportView[]; now: number }): ReactNode {
  const { t, lang } = useLang();
  const { session, openLogin } = useAuth();
  const s = summarize(reports, now);
  const maxCat = Math.max(1, ...CATEGORIES.map((c) => s.byCategory[c]));

  const queue = useMemo(
    () =>
      reports
        .filter((r) => r.status !== "resolved")
        .map((r) => ({ r, d: derive(r, now) }))
        .sort((a, b) => Number(b.d.overdue) - Number(a.d.overdue) || b.d.score - a.d.score),
    [reports, now],
  );

  const spots = useMemo(() => hotspots(reports).slice(0, 4), [reports]);

  const tiles: { label: string; value: string }[] = [
    { label: t("dash.total"), value: String(s.total) },
    { label: t("dash.open"), value: String(s.open) },
    { label: t("dash.resolved"), value: String(s.resolved) },
    { label: t("dash.fix"), value: `${s.avgFixDays.toFixed(1)} ${t("unit.days")}` },
    { label: t("dash.past"), value: String(s.pastDeadline) },
    { label: t("dash.escalated"), value: String(s.escalated) },
    { label: t("dash.reopened"), value: String(s.reopened) },
  ];

  return (
    <div className="space-y-12">
      <div>
        <h3 className="display-sm">{t("stats.public.title")}</h3>
        <p className="mt-3 max-w-2xl text-[var(--ink-soft)]">{t("stats.public.lead")}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 lg:grid-cols-7">
        {tiles.map((tile) => (
          <div key={tile.label} className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{tile.label}</p>
            <p className="num mt-2 text-3xl font-bold text-[var(--ink)]">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="stats-category">
          <h4 id="stats-category" className="text-lg font-bold text-[var(--ink)]">
            {t("stats.public.byCategory")}
          </h4>
          <ul className="mt-6 space-y-5">
            {CATEGORIES.map((c) => {
              const n = s.byCategory[c];
              return (
                <li key={c} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-4">
                  <span className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
                    <svg viewBox="4 2.5 24 24" width="20" height="20" aria-hidden="true">
                      <CategoryGlyph category={c} />
                    </svg>
                    {CATEGORY_META[c][lang]}
                  </span>
                  <span className="h-4 bg-[var(--rule)]" aria-hidden="true">
                    <span className="block h-full bg-[var(--ink)]" style={{ width: `${(n / maxCat) * 100}%` }} />
                  </span>
                  <span className="num text-right text-sm font-bold text-[var(--ink)]">{n}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="stats-hotspots">
          <h4 id="stats-hotspots" className="text-lg font-bold text-[var(--ink)]">
            {t("stats.public.hotspots")}
          </h4>
          {spots.length === 0 ? (
            <p className="mt-6 border-2 border-dashed border-[var(--rule)] p-5 text-sm text-[var(--ink-soft)]">{t("oc.hotspotsEmpty")}</p>
          ) : (
            <ul className="mt-6 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
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

      <section aria-labelledby="stats-queue">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h4 id="stats-queue" className="text-lg font-bold text-[var(--ink)]">
            {t("stats.public.queue")}
          </h4>
          {!session && <p className="text-sm text-[var(--ink-mute)]">{t("stats.public.queueHint")}</p>}
        </div>

        {queue.length === 0 ? (
          <p className="mt-6 border-2 border-dashed border-[var(--rule)] p-5 text-sm text-[var(--ink-soft)]">{t("stats.public.empty")}</p>
        ) : (
          <ul className="mt-6 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
            {queue.map(({ r, d }) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[var(--ink)] bg-[var(--surface)]">
                  <svg viewBox="4 2.5 24 24" width="20" height="20" aria-hidden="true">
                    <CategoryGlyph category={r.category} />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[var(--ink)]">{CATEGORY_META[r.category][lang]}</span>
                  <span className="num block truncate text-xs text-[var(--ink-mute)]">
                    {r.id} · {t(`stage.${r.status}` as Key)} · {r.team ? t(`team.${r.team}` as Key) : t("stats.public.unassigned")}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-[var(--ink)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TONE_VAR[d.tone] }} aria-hidden="true" />
                  {t(toneLabelKey(d.tone))} <span className="num">{d.score}</span>
                </span>
                {!session && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openLogin({ kind: "vote", id: r.id })}
                  >
                    {t("vote.see")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
