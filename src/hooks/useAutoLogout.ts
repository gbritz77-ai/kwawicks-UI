import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuth, msUntilExpiry, isLoggedIn } from "../api/auth";

export function useAutoLogout() {
  const nav = useNavigate();

  useEffect(() => {
    if (!isLoggedIn()) return;

    const ms = msUntilExpiry();
    if (ms === null) return;

    const t = window.setTimeout(() => {
      clearAuth();
      nav("/login", { replace: true });
    }, ms);

    return () => window.clearTimeout(t);
  }, [nav]);
}