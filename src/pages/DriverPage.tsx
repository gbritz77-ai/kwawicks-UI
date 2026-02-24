import React from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthTokens } from "../api/auth";

export default function DriverPage() {
  const nav = useNavigate();

  function logout() {
    clearAuthTokens();
    nav("/login", { replace: true });
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ fontSize: 22, fontWeight: 900 }}>Driver Screen</div>
      <div style={{ marginTop: 6, opacity: 0.75 }}>
        Simple driver-only screen (we’ll add features next).
      </div>

      <button
        style={{
          marginTop: 18,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "white",
          cursor: "pointer",
          fontWeight: 900,
        }}
        onClick={logout}
      >
        Log out
      </button>
    </div>
  );
}