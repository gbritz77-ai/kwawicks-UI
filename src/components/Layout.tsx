import React from "react";
import NavBar from "./NavBar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </main>
    </>
  );
}
