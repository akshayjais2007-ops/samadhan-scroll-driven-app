"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { CitizenDashboard } from "@/components/app/citizen-dashboard";
import { LiveMap } from "@/components/app/live-map";
import { OfficerConsole } from "@/components/app/officer-console";
import { ReportForm } from "@/components/app/report-form";
import { SmsInbox } from "@/components/app/sms-inbox";
import { notify } from "@/components/app/toaster";
import { useReports } from "@/components/app/use-reports";
import { WardStats } from "@/components/app/ward-stats";
import { useLang } from "@/components/lang-provider";
import type { Key } from "@/lib/i18n";
import { KEYS, readString, writeString } from "@/lib/storage";

type Tab = "live" | "report" | "stats" | "citizen" | "officer" | "sms";
const TABS: { id: Tab; label: Key; hash: string }[] = [
  { id: "live", label: "nav.live", hash: "#live-map" },
  { id: "report", label: "nav.report", hash: "#report" },
  { id: "stats", label: "nav.stats", hash: "#ward-stats" },
  { id: "citizen", label: "nav.mydash", hash: "#my-dashboard" },
  { id: "officer", label: "nav.console", hash: "#officer-console" },
  { id: "sms", label: "nav.sms", hash: "#sms" },
];

// The working app below State 06. Guests can browse the map, the queue and ward stats;
// reporting, verifying and the dashboards need a sign-in.
export function AppShell(): ReactNode {
  const { t } = useLang();
  const { session, requireLogin, openLogin, closeLogin, resumeNonce, pending } = useAuth();
  const data = useReports();
  const [tab, setTab] = useState<Tab>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const applyHash = (scroll: boolean) => {
      const match = TABS.find((x) => x.hash === window.location.hash);
      if (!match) return;
      // Reporting and the dashboards are for signed-in users only.
      if ((match.id === "citizen" || match.id === "officer" || match.id === "report") && !session) {
        openLogin({ kind: match.id === "report" ? "report" : "dashboard" });
        return;
      }
      setTab(match.id);
      if (scroll) window.requestAnimationFrame(() => document.getElementById("app")?.scrollIntoView({ block: "start" }));
    };
    const restore = window.setTimeout(() => {
      setNow(Date.now());
      applyHash(true);
    }, 0);
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    const onHash = () => applyHash(true);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.clearTimeout(restore);
      window.clearInterval(tick);
      window.removeEventListener("hashchange", onHash);
    };
  }, [session, openLogin]);

  // Resume the action that was interrupted by the login panel.
  useEffect(() => {
    if (!session || resumeNonce === 0) return;
    const action = pending;
    if (!action) return;
    const id = window.setTimeout(() => {
      switch (action.kind) {
        case "report":
          setTab("report");
          break;
        case "vote": {
          const result = dataRef.current.vote(action.id);
          notify(result === "counted" ? t("vote.counted") : result === "already" ? t("vote.already") : t("error.generic"));
          setTab("live");
          break;
        }
        case "confirm": {
          const result = dataRef.current.confirm(action.id);
          notify(result === "rejected" ? t("error.generic") : t("toast.confirmed"));
          setTab("live");
          break;
        }
        case "reopen": {
          const result = dataRef.current.reopen(action.id);
          notify(result === "rejected" ? t("error.generic") : t("toast.reopened"));
          setTab("live");
          break;
        }
        case "dashboard":
          setTab(session.role === "officer" ? "officer" : "citizen");
          break;
        case "stats":
          setTab("stats");
          break;
      }
      closeLogin();
    }, 0);
    return () => window.clearTimeout(id);
  }, [session, resumeNonce, pending, closeLogin, t, notify]);

  const selectTab = (next: Tab) => {
    if (next === "report" && !session) {
      openLogin({ kind: "report" });
      return;
    }
    if ((next === "citizen" || next === "officer") && !session) {
      openLogin({ kind: "dashboard" });
      return;
    }
    setTab(next);
    const hash = TABS.find((x) => x.id === next)?.hash ?? "";
    window.history.replaceState(null, "", hash);
  };

  const openReport = (id: string) => {
    setSelectedId(id);
    selectTab("live");
  };

  const ready = data.ready && now !== null;
  const statusLine = data.sync === "offline" ? t("app.offline") : data.sync === "live" ? t("app.synced") : t("app.loading");
  const pendingLine = data.pendingCount > 0 ? ` · ${t("app.pending", { n: data.pendingCount })}` : "";

  const visibleTabs = TABS.filter((item) => {
    if (item.id === "citizen") return session?.role === "citizen";
    if (item.id === "officer") return session?.role === "officer";
    return true;
  });

  return (
    <section id="app" className="border-t-2 border-[var(--ink)] px-4 pb-20 pt-12 md:px-8 md:pt-16">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--rule)] pb-6">
          <div>
            <p className="kicker">{t("app.eyebrow")}</p>
            <h2 className="display-sm mt-2">{t("app.title")}</h2>
            <p className="num mt-2 text-sm text-[var(--ink-soft)]" role="status">
              {statusLine}
              {pendingLine}
            </p>
          </div>
          <div role="tablist" aria-label={t("app.tabs")} className="flex flex-wrap gap-2">
            {visibleTabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="app-panel"
                  onClick={() => selectTab(item.id)}
                  className={`btn btn-sm md:min-h-12 ${active ? "btn-primary" : "btn-ghost"}`}
                >
                  {t(item.label)}
                </button>
              );
            })}
          </div>
        </div>

        <div id="app-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-8">
          {!ready ? (
            <p className="text-[var(--ink-soft)]">{t("app.loading")}</p>
          ) : tab === "live" ? (
            <LiveMap
              reports={data.reports}
              events={data.events}
              now={now ?? 0}
              session={session}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onVote={(id) => {
                if (!requireLogin({ kind: "vote", id })) return "missing";
                const result = data.vote(id);
                if (result === "counted") notify(t("vote.counted"));
                else if (result === "already") notify(t("vote.already"));
                return result;
              }}
              onAssign={(id, team) => data.assign(id, team)}
              onResolve={(id, photo) => data.resolve(id, photo)}
              onConfirm={(id) => {
                if (!requireLogin({ kind: "confirm", id })) return "missing";
                const result = data.confirm(id);
                notify(result === "rejected" ? t("error.generic") : t("toast.confirmed"));
                return result;
              }}
              onReopen={(id) => {
                if (!requireLogin({ kind: "reopen", id })) return "missing";
                const result = data.reopen(id);
                notify(result === "rejected" ? t("error.generic") : t("toast.reopened"));
                return result;
              }}
            />
          ) : tab === "report" ? (
            <ReportForm
              reports={data.reports}
              session={session}
              onCreate={data.create}
              onVote={(id) => {
                const result = data.vote(id);
                notify(result === "counted" ? t("vote.counted") : result === "already" ? t("vote.already") : t("error.generic"));
                return result;
              }}
              onDone={openReport}
            />
          ) : tab === "stats" ? (
            <WardStats reports={data.reports} now={now ?? 0} />
          ) : tab === "citizen" && session?.role === "citizen" ? (
            <CitizenDashboard
              reports={data.reports}
              events={data.events}
              now={now ?? 0}
              myVotes={data.myVotes}
              onConfirm={(id) => data.confirm(id)}
              onReopen={(id) => data.reopen(id)}
              onReport={() => selectTab("report")}
            />
          ) : tab === "officer" && session?.role === "officer" ? (
            <OfficerConsole reports={data.reports} now={now ?? 0} onAssign={data.assign} onResolve={data.resolve} />
          ) : (
            <SmsInbox reports={data.reports} events={data.events} />
          )}
        </div>
      </div>
    </section>
  );
}

export { readString, writeString, KEYS };
