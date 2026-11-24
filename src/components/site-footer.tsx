"use client";

import { useState, type ReactNode } from "react";
import { useLang } from "@/components/lang-provider";
import { useTheme, type ThemeChoice } from "@/components/theme-provider";
import type { Key } from "@/lib/i18n";

const CHOICE_KEY: Record<ThemeChoice, Key> = { system: "theme.system", light: "theme.light", dark: "theme.dark" };

// The footer carries the replay link for the opening and the language and theme controls.
export function SiteFooter(): ReactNode {
  const { t, lang, setLang } = useLang();
  const { choice, setChoice } = useTheme();
  const [replayKey, setReplayKey] = useState(0);

  const replay = () => {
    try {
      sessionStorage.removeItem("samadhan.intro.seen");
    } catch {
      /* ignore */
    }
    setReplayKey((k) => k + 1);
    window.dispatchEvent(new CustomEvent("samadhan:replay"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="border-t-2 border-[var(--ink)] px-4 py-12 md:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md">
          <div className="flex items-center gap-2.5">
            <span className="mark" aria-hidden="true" />
            <span className="flex items-baseline gap-2">
              <span className="brand">Samadhan</span>
              <span className="deva" lang="hi">
                {t("brand.deva")}
              </span>
            </span>
          </div>
          <p className="mt-3 text-sm text-[var(--ink-soft)]">{t("footer.note")}</p>
          <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={replay}>
            {t("footer.replay")}
          </button>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:gap-10">
          <div>
            <p className="kicker">{t("footer.language")}</p>
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
            <p className="kicker">{t("footer.theme")}</p>
            <div className="mt-2 flex gap-2">
              {(["system", "light", "dark"] as const).map((opt) => (
                <button key={opt} type="button" className={`btn btn-sm ${choice === opt ? "btn-primary" : "btn-ghost"}`} onClick={() => setChoice(opt)}>
                  {t(CHOICE_KEY[opt])}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" data-replay={replayKey} />
    </footer>
  );
}
