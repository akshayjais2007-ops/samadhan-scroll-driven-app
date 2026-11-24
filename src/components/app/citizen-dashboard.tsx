"use client";

import { useMemo, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { notify } from "@/components/app/toaster";
import { StatusTimeline, escKey, slaLine } from "@/components/app/live-map";
import { SmsInbox } from "@/components/app/sms-inbox";
import { useLang } from "@/components/lang-provider";
import { useTheme } from "@/components/theme-provider";
import { PriorityChips, TONE_VAR, toneLabelKey } from "@/components/ward/pin";
import { translate, type Key, type Lang } from "@/lib/i18n";
import { CATEGORY_META, derive, type ReportView } from "@/lib/ward";

type ActionResult = "ok" | "queued" | "rejected" | "missing";

// The citizen dashboard: my reports, what needs my confirmation, my verifications and my messages.
export function CitizenDashboard({
  reports,
  events,
  now,
  myVotes,
  onConfirm,
  onReopen,
  onReport,
}: {
  reports: ReportView[];
  events: Parameters<typeof SmsInbox>[0]["events"];
  now: number;
  myVotes: string[];
  onConfirm: (id: string) => ActionResult;
  onReopen: (id: string) => ActionResult;
  onReport: () => void;
}): ReactNode {
  const { t, lang, setLang } = useLang();
  const { session } = useAuth();
  const { choice, resolved, setChoice, cycle } = useTheme();

  const mine = useMemo(() => reports.filter((r) => r.reporterId === session?.id), [reports, session]);
  const awaiting = useMemo(() => mine.filter((r) => r.status === "resolved" && r.resolution === "pending"), [mine]);
  const closedByMe = useMemo(() => mine.filter((r) => r.resolution === "confirmed").length, [mine]);
  const verifiedCount = myVotes.length;

  const tiles: { label: string; value: string }[] = [
    { label: t("cd.filed"), value: String(mine.length) },
    { label: t("cd.verified"), value: String(verifiedCount) },
    { label: t("cd.resolved"), value: String(closedByMe) },
    { label: t("cd.awaiting"), value: String(awaiting.length) },
  ];

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--rule)] pb-6">
        <div>
          <p className="kicker">{t("nav.mydash")}</p>
          <h3 className="display-sm mt-2">{t("cd.greeting", { name: session?.name ?? "" })}</h3>
          {session?.phoneMasked && <p className="num mt-2 text-sm text-[var(--ink-mute)]">+91 {session.phoneMasked}</p>}
          <p className="mt-2 text-sm text-[var(--ink-soft)]">{t("cd.helped", { n: closedByMe })}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onReport}>
          {t("hero.cta.report")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{tile.label}</p>
            <p className="num mt-2 text-3xl font-bold text-[var(--ink)]">{tile.value}</p>
          </div>
        ))}
      </div>

      {/* Pinned at the top: the loop is not closed until the resident says so. */}
      <section aria-labelledby="cd-awaiting">
        <h4 id="cd-awaiting" className="text-lg font-bold text-[var(--ink)]">
          {t("cd.awaitingCard")}
        </h4>
        {awaiting.length === 0 ? (
          <p className="mt-4 border-2 border-dashed border-[var(--rule)] p-5 text-sm text-[var(--ink-soft)]">{t("cd.none")}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {awaiting.map((r) => (
              <li key={r.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="kicker">{CATEGORY_META[r.category][lang]}</p>
                    <p className="num mt-1 text-lg font-bold text-[var(--ink)]">{r.id}</p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">{r.description}</p>
                  </div>
                  {r.photo && r.afterPhoto && (
                    <img src={r.afterPhoto} alt="" className="h-20 w-28 shrink-0 border-2 border-[var(--ink)] object-cover" />
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const result = onConfirm(r.id);
                      notify(result === "rejected" || result === "missing" ? t("error.generic") : t("toast.confirmed"));
                    }}
                  >
                    {t("detail.confirm")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const result = onReopen(r.id);
                      notify(result === "rejected" || result === "missing" ? t("error.generic") : t("toast.reopened"));
                    }}
                  >
                    {t("detail.reopen")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cd-reports">
        <h4 id="cd-reports" className="text-lg font-bold text-[var(--ink)]">
          {t("cd.myReports")}
        </h4>
        {mine.length === 0 ? (
          <p className="mt-4 border-2 border-dashed border-[var(--rule)] p-5 text-sm text-[var(--ink-soft)]">{t("cd.noReports")}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {mine.map((r) => {
              const d = derive(r, now);
              return (
                <li key={r.id} className="panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="kicker">{CATEGORY_META[r.category][lang]}</p>
                      <p className="num mt-1 text-lg font-bold text-[var(--ink)]">{r.id}</p>
                      <p className="mt-1 max-w-xl text-sm text-[var(--ink-soft)]">{r.description}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--ink)]">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TONE_VAR[d.tone] }} aria-hidden="true" />
                      {t(toneLabelKey(d.tone))} <span className="num">{d.score}</span>
                    </span>
                  </div>

                  <div className="mt-4">
                    <StatusTimeline r={r} lang={lang} t={translate.bind(null, lang) as (k: Key, v?: Record<string, string | number>) => string} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="badge-soft">{t(`stage.${r.status}` as Key)}</span>
                    <span className="badge-soft">{slaLine(r, now, translate.bind(null, lang) as (k: Key, v?: Record<string, string | number>) => string)}</span>
                    {d.escalation !== "none" && (
                      <span className="badge-esc" data-level="high">
                        {t(escKey(d.escalation))}
                      </span>
                    )}
                    {r.reopenCount > 0 && <span className="badge-soft">{t("chip.reopened")} ×{r.reopenCount}</span>}
                  </div>

                  <div className="mt-4">
                    <p className="kicker mb-2">{t("function.why")}</p>
                    <PriorityChips parts={d.parts} score={d.score} lang={lang} compact />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="cd-inbox">
        <h4 id="cd-inbox" className="text-lg font-bold text-[var(--ink)]">
          {t("sms.title")}
        </h4>
        <div className="mt-4">
          <SmsInbox reports={reports} events={events} />
        </div>
      </section>

      <section aria-labelledby="cd-settings">
        <h4 id="cd-settings" className="text-lg font-bold text-[var(--ink)]">
          {t("cd.settings")}
        </h4>
        <div className="mt-4 grid gap-6 border-y border-[var(--rule)] py-5 sm:grid-cols-2">
          <div>
            <p className="kicker">{t("cd.language")}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={`btn btn-sm ${lang === "en" ? "btn-primary" : "btn-ghost"}`} onClick={() => setLang("en")}>
                {t("intro.english")}
              </button>
              <button type="button" className={`btn btn-sm ${lang === "hi" ? "btn-primary" : "btn-ghost"}`} onClick={() => setLang("hi")}>
                {t("intro.hindi")}
              </button>
            </div>
          </div>
          <div>
            <p className="kicker">{t("cd.theme")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["system", "light", "dark"] as const).map((opt) => (
                <button key={opt} type="button" className={`btn btn-sm ${choice === opt ? "btn-primary" : "btn-ghost"}`} onClick={() => setChoice(opt)}>
                  {t(`theme.${opt}` as Key)}
                </button>
              ))}
              <span className="sr-only" data-resolved={resolved} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={cycle} aria-hidden="true" tabIndex={-1}>
                ↻
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
