export type LoginResponse = {
  accessToken: string;
  idToken: string;
  refreshToken: string | null;
  expiresIn: number; // seconds
  tokenType: string; // "Bearer"
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6001";
const ID_TOKEN_KEY = "kw_idToken";

// storage keys
const ACCESS_TOKEN = "kw_accessToken";
const ID_TOKEN = "kw_idToken";
const REFRESH_TOKEN = "kw_refreshToken";
const EXPIRES_AT = "kw_expiresAt"; // epoch ms

export function saveAuthTokens(r: LoginResponse) {
  localStorage.setItem(ACCESS_TOKEN, r.accessToken);
  localStorage.setItem(ID_TOKEN, r.idToken);
  if (r.refreshToken) localStorage.setItem(REFRESH_TOKEN, r.refreshToken);
  else localStorage.removeItem(REFRESH_TOKEN);

  // buffer 30s
  const expiresAt = Date.now() + r.expiresIn * 1000 - 30_000;
  localStorage.setItem(EXPIRES_AT, String(expiresAt));
}

export function clearAuth() {
  localStorage.removeItem(ACCESS_TOKEN);
  localStorage.removeItem(ID_TOKEN);
  localStorage.removeItem(REFRESH_TOKEN);
  localStorage.removeItem(EXPIRES_AT);
  clearBranchAuth();
}

// ── Branch auth ────────────────────────────────────────────────────────────

const BRANCH_TOKEN_KEY   = "kw_branchToken";
const BRANCH_PROFILE_KEY = "kw_branchProfile";

export type BranchProfile = {
  username: string;
  hubId: string;
  branchName: string;
  permissions: string[];
};

export function saveBranchAuth(token: string, profile: BranchProfile, expiresIn: number) {
  localStorage.setItem(BRANCH_TOKEN_KEY, token);
  localStorage.setItem(BRANCH_PROFILE_KEY, JSON.stringify(profile));
  const expiresAt = Date.now() + expiresIn * 1000 - 30_000;
  localStorage.setItem(EXPIRES_AT, String(expiresAt));
}

export function clearBranchAuth() {
  localStorage.removeItem(BRANCH_TOKEN_KEY);
  localStorage.removeItem(BRANCH_PROFILE_KEY);
}

export function isBranchUser(): boolean {
  return !!localStorage.getItem(BRANCH_TOKEN_KEY);
}

export function getBranchProfile(): BranchProfile | null {
  const raw = localStorage.getItem(BRANCH_PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as BranchProfile; } catch { return null; }
}

export function hasBranchPermission(key: string): boolean {
  const p = getBranchProfile();
  return p?.permissions.includes(key) ?? false;
}

// ── Cognito access token (or branch token) ─────────────────────────────────

export function getAccessToken(): string | null {
  if (isBranchUser()) {
    const bt = localStorage.getItem(BRANCH_TOKEN_KEY);
    const exp = Number(localStorage.getItem(EXPIRES_AT) ?? "0");
    if (bt && Date.now() < exp) return bt;
    clearBranchAuth();
    return null;
  }
  const token = localStorage.getItem(ACCESS_TOKEN);
  if (!token) return null;

  const expiresAtRaw = localStorage.getItem(EXPIRES_AT);
  if (!expiresAtRaw) return token;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return token;

  if (Date.now() >= expiresAt) {
    // Token expired — return null so apiClient can attempt a refresh.
    // Do NOT clear auth here; that would wipe the refresh token before
    // the caller gets a chance to use it.
    return null;
  }

  return token;
}

export function isLoggedIn(): boolean {
  if (isBranchUser()) return !!getAccessToken();
  return !!(getAccessToken() || localStorage.getItem(REFRESH_TOKEN));
}
export function getExpiresAt(): number | null {
  const raw = localStorage.getItem("kw_expiresAt");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function msUntilExpiry(): number | null {
  const exp = getExpiresAt();
  if (!exp) return null;
  return Math.max(0, exp - Date.now());
}

export async function login(usernameOrEmail: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernameOrEmail, password }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || "Login failed.";
    throw new Error(msg);
  }

  return json as LoginResponse;
}
function base64UrlDecode(input: string) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = input.length % 4;
  if (pad) input += "=".repeat(4 - pad);
  return decodeURIComponent(
    atob(input)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
}

export type JwtProfile = {
  username?: string;
  groups: string[];
  sub?: string;
};

export function getProfileFromIdToken(): JwtProfile | null {
  if (isBranchUser()) {
    const bp = getBranchProfile();
    if (bp) return { username: bp.username, groups: ["BranchUser"], sub: undefined };
    return null;
  }
  const token = localStorage.getItem(ID_TOKEN_KEY);
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson);

    const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : [];
    const username = payload["cognito:username"] || payload["username"];

    return {
      username,
      groups,
      sub: payload["sub"],
    };
  } catch {
    return null;
  }
}
export function clearAuthTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("idToken");
  localStorage.removeItem("refreshToken");
}
export function hasRole(role: string): boolean {
  const p = getProfileFromIdToken();
  if (!p) return false;
  // Master has all roles
  if (p.groups.includes("Master")) return true;
  return p.groups.includes(role);
}
export function hasAnyRole(...roles: string[]): boolean {
  const p = getProfileFromIdToken();
  if (!p) return false;
  // Master has all roles
  if (p.groups.includes("Master")) return true;
  return p.groups.some(g => roles.includes(g));
}
export async function refreshTokens(): Promise<{ accessToken: string; idToken: string; expiresIn: number; tokenType: string }> {
  const refreshToken = localStorage.getItem("kw_refreshToken");
  if (!refreshToken) throw new Error("No refresh token");

  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6001";

  const res = await fetch(`${API_BASE}/api/Auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(json?.message || "Refresh failed");
  }

  return json;
}
export function saveRefreshedTokens(r: { accessToken: string; idToken: string; expiresIn: number; tokenType: string }) {
  localStorage.setItem("kw_accessToken", r.accessToken);
  localStorage.setItem("kw_idToken", r.idToken);

  const expiresAt = Date.now() + r.expiresIn * 1000 - 30_000;
  localStorage.setItem("kw_expiresAt", String(expiresAt));
}