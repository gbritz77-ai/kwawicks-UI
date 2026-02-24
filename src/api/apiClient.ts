import { getAccessToken, clearAuth, refreshTokens, saveRefreshedTokens } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6001";

async function doFetch(path: string, options: RequestInit, token: string | null) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token = getAccessToken();

  let res = await doFetch(path, options, token);

  // If unauthorized, try refresh once
  if (res.status === 401) {
    try {
      const refreshed = await refreshTokens();
      saveRefreshedTokens(refreshed);
      token = getAccessToken();
      res = await doFetch(path, options, token);
    } catch {
      clearAuth();
      throw new Error("Session expired. Please sign in again.");
    }
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
  }

  return (json ?? (text as any)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: any) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};