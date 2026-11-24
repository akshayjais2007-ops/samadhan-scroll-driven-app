"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { Toaster } from "@/components/app/toaster";
import { Intro } from "@/components/intro/intro";
import { ScrollStage } from "@/components/scroll/scroll-stage";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// One website: the opening, the scroll story, then the working app, under one header.
export function Home(): ReactNode {
  const [idx, setIdx] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const onIntroDone = useCallback(() => setIntroDone(true), []);

  // The footer's replay link asks for the opening to play again.
  useEffect(() => {
    const onReplay = () => setIntroDone(false);
    window.addEventListener("samadhan:replay", onReplay);
    return () => window.removeEventListener("samadhan:replay", onReplay);
  }, []);

  return (
    <>
      <SiteHeader idx={idx} />
      <main>
        <ScrollStage introDone={introDone} onStateChange={setIdx} />
        <AppShell />
      </main>
      <SiteFooter />
      <Toaster />
      {!introDone && <Intro onDone={onIntroDone} />}
    </>
  );
}
