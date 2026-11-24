"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { notify } from "@/components/app/toaster";
import { useLang } from "@/components/lang-provider";
import { DEMO_CITIZEN, DEMO_OTP, DEMO_OFFICER, isValidIndianMobile, type Role } from "@/lib/auth";
import { translate, type Lang } from "@/lib/i18n";
import { pushLocalSms } from "@/lib/sms-store";

type Step = "phone" | "otp";

// The sign-in panel: a modal on desktop, a full screen on phones.
// Citizen signs in with a mobile number and a demo OTP; officer with an ID and password.
export function LoginPanel(): ReactNode {
  const { t, lang } = useLang();
  const { loginOpen, closeLogin, signIn } = useAuth();
  const [role, setRole] = useState<Role>("citizen");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loginOpen) return;
    const focus = window.setTimeout(() => otpRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLogin();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [loginOpen, step, role, closeLogin]);

  if (!loginOpen) return null;

  const say = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(lang, key, vars);

  const sendOtp = (e: FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return setError(say("login.needPhone"));
    if (!isValidIndianMobile(digits)) return setError(say("login.invalidPhone"));
    setError(null);
    // The mock SMS lands in the inbox, exactly like a real one would.
    const masked = `${digits.slice(0, 2)}•••••${digits.slice(-3)}`;
    pushLocalSms(say("sms.otp", { otp: DEMO_OTP }));
    notify(say("login.otpSent", { phone: masked }));
    setStep("otp");
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 6) return setError(say("login.needOtp"));
    if (otp.trim() !== DEMO_OTP) return setError(say("login.wrongOtp"));
    setBusy(true);
    setError(null);
    try {
      const user = await signIn("citizen", { phone: phone.replace(/\D/g, ""), name: name.trim() || undefined });
      notify(say("login.signedIn", { name: user.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : say("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const officerSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!officerId.trim()) return setError(say("login.needOfficerId"));
    if (!password) return setError(say("login.needPassword"));
    setBusy(true);
    setError(null);
    try {
      const user = await signIn("officer", { officerId: officerId.trim(), password });
      notify(say("login.signedIn", { name: user.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : say("login.badOfficer"));
    } finally {
      setBusy(false);
    }
  };

  const demoCitizen = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await signIn("citizen", { phone: DEMO_CITIZEN.phone, name: DEMO_CITIZEN.name });
      notify(say("login.signedIn", { name: user.name }));
    } catch {
      setError(say("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const demoOfficer = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await signIn("officer", { officerId: DEMO_OFFICER.officerId, password: DEMO_OFFICER.password });
      notify(say("login.signedIn", { name: user.name }));
    } catch {
      setError(say("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-[var(--ink)]/55 p-0 md:items-center md:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-0 bg-[var(--paper)] p-5 md:h-auto md:max-h-[90vh] md:border-2 md:border-[var(--ink)] md:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="login-title" className="display-sm">
              {t("login.title")}
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">{t("login.subtitle")}</p>
          </div>
          <button type="button" onClick={closeLogin} className="btn btn-ghost btn-sm shrink-0">
            {t("login.close")}
          </button>
        </div>

        <div className="seg mt-5" role="tablist" aria-label={t("login.title")}>
          <button
            type="button"
            role="tab"
            aria-selected={role === "citizen"}
            className={`seg-item ${role === "citizen" ? "seg-on" : ""}`}
            onClick={() => {
              setRole("citizen");
              setError(null);
            }}
          >
            {t("login.citizen")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={role === "officer"}
            className={`seg-item ${role === "officer" ? "seg-on" : ""}`}
            onClick={() => {
              setRole("officer");
              setError(null);
            }}
          >
            {t("login.officer")}
          </button>
        </div>

        {role === "citizen" ? (
          <form onSubmit={step === "phone" ? sendOtp : verify} className="mt-6 space-y-4">
            <p className="kicker">{step === "phone" ? t("login.stepPhone") : t("login.stepOtp")}</p>

            {step === "phone" ? (
              <div>
                <label htmlFor="phone" className="block text-sm font-bold text-[var(--ink)]">
                  {t("login.phone")}
                </label>
                <div className="mt-2 flex items-stretch">
                  <span className="flex items-center border-2 border-r-0 border-[var(--ink)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--ink-soft)]">
                    +91
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    aria-describedby="phone-hint"
                    className="num w-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)]"
                  />
                </div>
                <p id="phone-hint" className="mt-2 text-xs text-[var(--ink-mute)]">
                  {t("login.needPhone")}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="otp" className="block text-sm font-bold text-[var(--ink)]">
                    {t("login.otp")}
                  </label>
                  <input
                    id="otp"
                    ref={otpRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="num mt-2 w-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-3 text-center text-2xl tracking-[0.4em] text-[var(--ink)]"
                  />
                  <p className="mt-2 text-xs font-bold text-[var(--ink-soft)]">{t("login.otpHint")}</p>
                </div>
                <div>
                  <label htmlFor="name" className="block text-sm font-bold text-[var(--ink)]">
                    {t("login.name")}
                  </label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("login.namePh")}
                    className="mt-2 w-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)] placeholder:text-[var(--ink-mute)]"
                  />
                </div>
              </>
            )}

            {error && (
              <p role="alert" className="border-2 border-[var(--high)] bg-[var(--surface)] p-3 text-sm font-bold text-[var(--high)]">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {step === "phone" ? t("login.sendOtp") : t("login.verify")}
            </button>

            {step === "otp" && (
              <button type="button" className="btn btn-ghost w-full" onClick={() => setStep("phone")}>
                {t("login.stepPhone")}
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={officerSignIn} className="mt-6 space-y-4">
            <div>
              <label htmlFor="officerId" className="block text-sm font-bold text-[var(--ink)]">
                {t("login.officerId")}
              </label>
              <input
                id="officerId"
                type="text"
                autoComplete="username"
                value={officerId}
                onChange={(e) => setOfficerId(e.target.value)}
                className="num mt-2 w-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)]"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-bold text-[var(--ink)]">
                {t("login.password")}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full border-2 border-[var(--ink)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)]"
              />
              <p className="mt-2 text-xs font-bold text-[var(--ink-soft)]">{t("login.officerHint")}</p>
            </div>

            {error && (
              <p role="alert" className="border-2 border-[var(--high)] bg-[var(--surface)] p-3 text-sm font-bold text-[var(--high)]">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {t("nav.login")}
            </button>
          </form>
        )}

        <div className="mt-7 border-t border-[var(--rule)] pt-5">
          <p className="kicker">{t("login.demoCitizen")}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={demoCitizen} disabled={busy}>
              {t("login.demoCitizen")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={demoOfficer} disabled={busy}>
              {t("login.demoOfficer")}
            </button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--ink-mute)]">{t("login.simulated")}</p>
        </div>
      </div>
    </div>
  );
}
