// Simulated authentication for the Samadhan prototype.
// No real SMS is sent and no password is stored anywhere. The demo credentials below are
// the only secrets in the project and they exist purely to make the prototype demonstrable.

export type Role = "citizen" | "officer";

export type SessionUser = {
  id: string;
  role: Role;
  name: string;
  phoneMasked?: string;
  officerId?: string;
  title?: string;
};

export const SESSION_KEY = "samadhan.session.v1";
export const OTP_KEY = "samadhan.otp.v1";

// Demo constants. The officer password lives here and nowhere else.
export const DEMO_OTP = "123456";
export const DEMO_CITIZEN = { id: "demo-meera", name: "Meera Gupta", phone: "9876543210" };
export const DEMO_OFFICER = {
  id: "demo-rakesh",
  name: "Rakesh Sharma",
  title: "Ward 14 Junior Engineer",
  officerId: "WARD14-JE-01",
  password: "samadhan@2026",
};

// A mobile number is masked everywhere except the owner, who sees it masked too.
export function maskPhone(phone: string) {
  if (phone.length < 5) return "•••••";
  return `${phone.slice(0, 2)}•••••${phone.slice(-3)}`;
}

export function isValidIndianMobile(phone: string) {
  return /^[6-9]\d{9}$/.test(phone);
}

export function isValidOfficerId(id: string) {
  return /^[A-Za-z0-9-]{4,24}$/.test(id);
}

// The stored bearer token, read defensively from localStorage.
export function sessionToken(): string {
  try {
    if (typeof window === "undefined") return "";
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? "";
  } catch {
    return "";
  }
}

// A guard action that was interrupted by the login panel and resumes once signed in.
export type GuardedAction =
  | { kind: "report" }
  | { kind: "vote"; id: string }
  | { kind: "confirm"; id: string }
  | { kind: "reopen"; id: string }
  | { kind: "dashboard" }
  | { kind: "stats" };
