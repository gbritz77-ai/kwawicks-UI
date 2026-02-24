import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AppShell from "./pages/AppShell";
import RequireAuth from "./components/RequireAuth";
import HubTasksPage from "./pages/HubTasksPage";
import DriverPage from "./pages/DriverPage";
import RequireRole from "./components/RequireRole";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
      <Route
        path="/app/hub-tasks"
        element={
          <RequireAuth>
            <HubTasksPage />
          </RequireAuth>
        }
      />
      <Route
        path="/driver"
        element={
          <RequireRole role="Driver">
            <DriverPage />
          </RequireRole>
        }
      />
    </Routes>
  );
}