"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SESSION_KEY, type GuardedAction, type Role, type SessionUser } from "@/lib/auth";
import { readString, writeString } from "@/lib/storage";

type AuthContextValue = {
  session: SessionUser | null;
  ready: boolean;
  loginOpen: boolean;
  pending: GuardedAction | null;
  resumeNonce: number;
  openLogin: (action?: GuardedAction) => void;
  closeLogin: () => void;
  signIn: (role: Role, payload: { phone?: string; name?: string; officerId?: string; password?: string }) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  requireLogin: (action: GuardedAction) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): { token: string; user: SessionUser } | null {
  try {
    const raw = readString(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token: string; user: SessionUser };
    if (!parsed?.token || !parsed?.user?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Holds the simulated session, the login panel state and the action that was interrupted by it.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pending, setPending] = useState<GuardedAction | null>(null);
  const [resumeNonce, setResumeNonce] = useState(0);

  useEffect(() => {
    const stored = readSession();
    if (!stored) {
      const done = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(done);
    }
    // Validate the stored token against the server before trusting it.
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${stored.token}` }, cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { user: SessionUser }) : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.user) {
          setSession(data.user);
          writeString(SESSION_KEY, JSON.stringify({ token: stored.token, user: data.user }));
        } else {
          writeString(SESSION_KEY, "");
        }
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openLogin = useCallback((action?: GuardedAction) => {
    setPending(action ?? null);
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    setPending(null);
  }, []);

  const signIn = useCallback(
    async (role: Role, payload: { phone?: string; name?: string; officerId?: string; password?: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, ...payload }),
      });
      const data = (await res.json()) as { token?: string; user?: SessionUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error ?? "Could not sign you in");
      }
      writeString(SESSION_KEY, JSON.stringify({ token: data.token, user: data.user }));
      setSession(data.user);
      setLoginOpen(false);
      setResumeNonce((n) => n + 1);
      return data.user;
    },
    [],
  );

  const signOut = useCallback(async () => {
    const stored = readSession();
    if (stored?.token) {
      try {
        await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${stored.token}` } });
      } catch {
        /* the local session is cleared either way */
      }
    }
    writeString(SESSION_KEY, "");
    setSession(null);
  }, []);

  // Returns false when the visitor must sign in first.
  const requireLogin = useCallback(
    (action: GuardedAction) => {
      if (session) return true;
      openLogin(action);
      return false;
    },
    [session, openLogin],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ session, ready, loginOpen, pending, resumeNonce, openLogin, closeLogin, signIn, signOut, requireLogin }),
    [session, ready, loginOpen, pending, resumeNonce, openLogin, closeLogin, signIn, signOut, requireLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
