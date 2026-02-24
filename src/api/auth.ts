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
}

export function getAccessToken(): string | null {
  const token = localStorage.getItem(ACCESS_TOKEN);
  if (!token) return null;

  const expiresAtRaw = localStorage.getItem(EXPIRES_AT);
  if (!expiresAtRaw) return token;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return token;

  if (Date.now() >= expiresAt) {
    clearAuth();
    return null;
  }

  return token;
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
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
  return !!p?.groups?.includes(role);
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