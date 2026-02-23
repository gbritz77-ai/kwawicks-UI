import { Navigate, Route, Routes } from "react-router-dom";

function AppShell() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>KwaWicks</h2>
      <p>Dashboard coming next…</p>
    </div>
  );
}

function LoginPlaceholder() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>Login</h2>
      <p>Login screen coming next…</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPlaceholder />} />
      <Route path="/app" element={<AppShell />} />
    </Routes>
  );
}