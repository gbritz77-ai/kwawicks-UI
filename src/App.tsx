import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AppShell from "./pages/AppShell";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import HubTasksPage from "./pages/HubTasksPage";
import DeliveryOrdersPage from "./pages/DeliveryOrdersPage";
import DriverPage from "./pages/DriverPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import DriverReportsPage from "./pages/DriverReportsPage";
import StatementPage from "./pages/StatementPage";
import UserManagementPage from "./pages/UserManagementPage";
import HelpPage from "./pages/HelpPage";
import SuppliersPage from "./pages/SuppliersPage";
import ProcurementOrdersPage from "./pages/ProcurementOrdersPage";
import CollectionRequestsPage from "./pages/CollectionRequestsPage";

function AuthLayout({ children }: { children: React.ReactElement }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/app"                 element={<AuthLayout><AppShell /></AuthLayout>} />
      <Route path="/app/hub-tasks"       element={<AuthLayout><HubTasksPage /></AuthLayout>} />
      <Route path="/app/delivery-orders" element={<AuthLayout><DeliveryOrdersPage /></AuthLayout>} />
      <Route path="/app/reports"         element={<AuthLayout><AdminReportsPage /></AuthLayout>} />
      <Route path="/app/users"              element={<AuthLayout><UserManagementPage /></AuthLayout>} />
      <Route path="/app/suppliers"          element={<AuthLayout><SuppliersPage /></AuthLayout>} />
      <Route path="/app/procurement-orders" element={<AuthLayout><ProcurementOrdersPage /></AuthLayout>} />
      <Route path="/app/collection-requests" element={<AuthLayout><CollectionRequestsPage /></AuthLayout>} />
      <Route path="/driver"              element={<AuthLayout><DriverPage /></AuthLayout>} />
      <Route path="/driver/reports"      element={<AuthLayout><DriverReportsPage /></AuthLayout>} />

      <Route path="/app/help" element={<AuthLayout><HelpPage /></AuthLayout>} />
      <Route path="/driver/help" element={<AuthLayout><HelpPage /></AuthLayout>} />

      {/* Statement is print-only — no nav bar */}
      <Route path="/app/statement" element={<RequireAuth><StatementPage /></RequireAuth>} />

      {/* Catch-all must be last so it never shadows real routes */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}