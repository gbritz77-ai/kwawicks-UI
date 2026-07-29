import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AppShell from "./pages/AppShell";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import HubTasksPage from "./pages/HubTasksPage";
import DeliveryOrdersPage from "./pages/DeliveryOrdersPage";
import DriverPage from "./pages/DriverPage";
import DriverDashboardPage from "./pages/DriverDashboardPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import DriverReportsPage from "./pages/DriverReportsPage";
import StatementPage from "./pages/StatementPage";
import UserManagementPage from "./pages/UserManagementPage";
import HelpPage from "./pages/HelpPage";
import SuppliersPage from "./pages/SuppliersPage";
import ProcurementOrdersPage from "./pages/ProcurementOrdersPage";
import CollectionRequestsPage from "./pages/CollectionRequestsPage";
import DeliveryRunsPage from "./pages/DeliveryRunsPage";
import HubSalesPage from "./pages/HubSalesPage";
import StaffMembersPage from "./pages/StaffMembersPage";
import PettyCashPage from "./pages/PettyCashPage";
import HubRequestsPage from "./pages/HubRequestsPage";
import SettingsPage from "./pages/SettingsPage";
import ClientAccountsPage from "./pages/ClientAccountsPage";
import DriverSalesPage from "./pages/DriverSalesPage";
import DriverAllocationsPage from "./pages/DriverAllocationsPage";
import DriverSalePage from "./pages/DriverSalePage";
import PriceApprovalsPage from "./pages/PriceApprovalsPage";
import SlaughterPage from "./pages/SlaughterPage";
import CostAveragesPage from "./pages/CostAveragesPage";
import OtpReportPage from "./pages/OtpReportPage";
import ReconPage from "./pages/ReconPage";
import SalesReportPage from "./pages/SalesReportPage";
import StockLossPage from "./pages/StockLossPage";
import VehicleTrackingPage from "./pages/VehicleTrackingPage";
import FleetPage from "./pages/FleetPage";
import SitesPage from "./pages/SitesPage";
import DipTanksPage from "./pages/DipTanksPage";
import FuelPage from "./pages/FuelPage";
import FuelReportPage from "./pages/FuelReportPage";
import DriverFuelPage from "./pages/DriverFuelPage";
import AiReportsPage from "./pages/AiReportsPage";

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
      <Route path="/app/delivery-runs"       element={<AuthLayout><DeliveryRunsPage /></AuthLayout>} />
      <Route path="/app/hub-sales"    element={<AuthLayout><HubSalesPage /></AuthLayout>} />
      <Route path="/app/staff-members" element={<AuthLayout><StaffMembersPage /></AuthLayout>} />
      <Route path="/app/petty-cash"    element={<AuthLayout><PettyCashPage /></AuthLayout>} />
      <Route path="/app/hub-requests"  element={<AuthLayout><HubRequestsPage /></AuthLayout>} />
      <Route path="/app/settings"         element={<AuthLayout><SettingsPage /></AuthLayout>} />
      <Route path="/app/client-accounts"  element={<AuthLayout><ClientAccountsPage /></AuthLayout>} />
      <Route path="/app/price-approvals"  element={<AuthLayout><PriceApprovalsPage /></AuthLayout>} />
      <Route path="/app/slaughter"           element={<AuthLayout><SlaughterPage /></AuthLayout>} />
      <Route path="/app/cost-averages"       element={<AuthLayout><CostAveragesPage /></AuthLayout>} />
      <Route path="/app/otp-report"          element={<AuthLayout><OtpReportPage /></AuthLayout>} />
      <Route path="/app/recon"               element={<AuthLayout><ReconPage /></AuthLayout>} />
      <Route path="/app/sales-report"        element={<AuthLayout><SalesReportPage /></AuthLayout>} />
      <Route path="/app/stock-losses"         element={<AuthLayout><StockLossPage /></AuthLayout>} />
      <Route path="/app/vehicle-tracking"    element={<AuthLayout><VehicleTrackingPage /></AuthLayout>} />
      <Route path="/app/fleet"              element={<AuthLayout><FleetPage /></AuthLayout>} />
      <Route path="/app/sites"              element={<AuthLayout><SitesPage /></AuthLayout>} />
      <Route path="/app/dip-tanks"          element={<AuthLayout><DipTanksPage /></AuthLayout>} />
      <Route path="/app/fuel"               element={<AuthLayout><FuelPage /></AuthLayout>} />
      <Route path="/app/fuel-report"        element={<AuthLayout><FuelReportPage /></AuthLayout>} />
      <Route path="/app/ai-reports"         element={<AuthLayout><AiReportsPage /></AuthLayout>} />
      <Route path="/app/driver-allocations"  element={<AuthLayout><DriverAllocationsPage /></AuthLayout>} />
      <Route path="/driver"              element={<AuthLayout><DriverDashboardPage /></AuthLayout>} />
      <Route path="/driver/work"         element={<AuthLayout><DriverPage /></AuthLayout>} />
      <Route path="/driver/reports"      element={<AuthLayout><DriverReportsPage /></AuthLayout>} />
      <Route path="/driver/sales"        element={<AuthLayout><DriverSalesPage /></AuthLayout>} />
      <Route path="/driver/stock-sales"  element={<AuthLayout><DriverSalePage /></AuthLayout>} />
      <Route path="/driver/fuel"          element={<AuthLayout><DriverFuelPage /></AuthLayout>} />

      <Route path="/app/help" element={<AuthLayout><HelpPage /></AuthLayout>} />
      <Route path="/driver/help" element={<AuthLayout><HelpPage /></AuthLayout>} />

      {/* Statement is print-only — no nav bar */}
      <Route path="/app/statement" element={<RequireAuth><StatementPage /></RequireAuth>} />

      {/* Catch-all must be last so it never shadows real routes */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}