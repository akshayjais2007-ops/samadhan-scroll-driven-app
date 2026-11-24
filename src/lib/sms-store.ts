// Locally generated messages that do not come from the ward server, such as the login OTP.
// Stored on the device with defensive try/catch.
const KEY = "samadhan.sms.v1";

export type LocalSms = { id: string; at: string; text: string };

export function readLocalSms(): LocalSms[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalSms[]) : [];
  } catch {
    return [];
  }
}

export function pushLocalSms(text: string): LocalSms[] {
  const message: LocalSms = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), text };
  const next = [message, ...readLocalSms()].slice(0, 40);
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota or privacy-mode errors */
  }
  return next;
}

export function clearLocalSms() {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
