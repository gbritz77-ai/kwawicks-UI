import React from "react";
import NavBar from "./NavBar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f1f5f9" }}>
      <NavBar />
      <main style={{ flex: 1, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </main>
    </div>
  );
}
