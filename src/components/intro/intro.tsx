"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "@/components/lang-provider";
import { WardSvg } from "@/components/ward/ward-map";
import { KEYS, readString, writeString } from "@/lib/storage";

const SEEN_KEY = "samadhan.intro.seen";
const DURATION = 3000;

// The opening plays once per session. It never blocks the page: the site renders underneath.
export function Intro({ onDone }: { onDone: () => void }): ReactNode {
  const { lang, t, setLang } = useLang();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [askLanguage, setAskLanguage] = useState(false);
  const timers = useRef<number[]>([]);

  const finish = useRef<() => void>(() => {});

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) {
      onDone();
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const languageChosen = Boolean(readString(KEYS.lang));
    // First visit asks for the language. Otherwise the device language decides.
    const show = window.setTimeout(() => {
      setAskLanguage(!languageChosen);
      setVisible(true);
    }, 0);

    const at = (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, ms);
      timers.current.push(id);
    };

    const leave = () => {
      setLeaving(true);
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
      at(reduced ? 60 : 320, () => {
        setVisible(false);
        onDone();
      });
    };

    finish.current = leave;

    // Any key, scroll or tap skips the intro immediately.
    const onKey = (e: KeyboardEvent) => leave();
    const onScroll = () => leave();
    const onPointer = () => leave();
    window.addEventListener("keydown", onKey, { once: true });
    window.addEventListener("scroll", onScroll, { once: true, passive: true });
    window.addEventListener("pointerdown", onPointer, { once: true });

    at(reduced ? 600 : DURATION, leave);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointer);
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, [onDone]);

  const choose = (next: "en" | "hi") => {
    setLang(next);
    writeString(KEYS.lang, next);
    setAskLanguage(false);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[var(--paper)] ${leaving ? "intro-leave" : ""}`}
      role="dialog"
      aria-label={t("brand")}
    >
      {/* The ward map draws itself, then lifts away as the hero takes over. */}
      <div className="intro-map absolute inset-0">
        <WardSvg draw />
      </div>
      <div className="intro-scrim absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-6 text-center">
        <p className="intro-roads kicker">{t("intro.roads")}</p>

        <h1 className="intro-wordmark mt-4">
          <span className="block text-[clamp(2.6rem,11vw,6.5rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
            Samadhan
          </span>
          <span className="mt-2 block text-[clamp(1.2rem,4vw,2.1rem)] font-bold text-[var(--ink-soft)]" lang="hi">
            समाधान
          </span>
        </h1>

        <p className="intro-tagline mt-6 max-w-md text-[clamp(1rem,2.2vw,1.4rem)] font-medium text-[var(--ink-soft)]">
          {t("intro.tagline")}
        </p>

        {askLanguage && (
          <div className="intro-lang mt-9">
            <p className="kicker">{t("intro.language")}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              <button type="button" className="btn btn-ghost" onClick={() => choose("en")}>
                {t("intro.english")}
              </button>
              <button type="button" className="btn btn-ghost" lang="hi" onClick={() => choose("hi")}>
                {t("intro.hindi")}
              </button>
            </div>
          </div>
        )}
      </div>

      <button type="button" className="btn btn-ghost btn-sm absolute bottom-4 right-4 z-20" onClick={() => finish.current()}>
        {t("intro.skip")}
      </button>

      <span className="sr-only" aria-live="polite">
        {lang === "hi" ? "समाधान। आपका वार्ड। आपकी आवाज़।" : "Samadhan. Your ward. Your voice."}
      </span>
    </div>
  );
}
