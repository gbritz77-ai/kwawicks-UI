import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AppShell from "./pages/AppShell";
import RequireAuth from "./components/RequireAuth";
import HubTasksPage from "./pages/HubTasksPage";
import DeliveryOrdersPage from "./pages/DeliveryOrdersPage";
import DriverPage from "./pages/DriverPage";

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
        path="/app/delivery-orders"
        element={
          <RequireAuth>
            <DeliveryOrdersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/driver"
        element={
          <RequireAuth>
            <DriverPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}