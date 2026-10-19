import { api } from "./apiClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6001";

export type BranchUserDto = {
  branchUserId: string;
  branchId: string;
  username: string;
  isActive: boolean;
};

export type BranchDto = {
  branchId: string;
  name: string;
  location: string;
  isActive: boolean;
  permissions: string[];
  createdAt: string;
  users: BranchUserDto[];
};

export type BranchLoginResponse = {
  token: string;
  branchId: string;
  branchName: string;
  username: string;
  permissions: string[];
  expiresIn: number;
};

export type CreateBranchRequest = {
  name: string;
  location: string;
  permissions: string[];
};

export type UpdateBranchRequest = {
  name: string;
  location: string;
  isActive: boolean;
  permissions: string[];
};

export const branchesApi = {
  list: () => api.get<BranchDto[]>("/api/branches"),
  get:  (id: string) => api.get<BranchDto>(`/api/branches/${id}`),
  create: (req: CreateBranchRequest) => api.post<BranchDto>("/api/branches", req),
  update: (id: string, req: UpdateBranchRequest) => api.put<BranchDto>(`/api/branches/${id}`, req),
  delete: (id: string) => api.del<void>(`/api/branches/${id}`),

  createUser: (branchId: string, username: string, pin: string) =>
    api.post<BranchUserDto>(`/api/branches/${branchId}/users`, { username, pin }),
  updateUserPin: (branchId: string, userId: string, pin: string) =>
    api.put<BranchUserDto>(`/api/branches/${branchId}/users/${userId}/pin`, { pin }),
  deleteUser: (branchId: string, userId: string) =>
    api.del<void>(`/api/branches/${branchId}/users/${userId}`),
};

export async function branchLogin(username: string, pin: string): Promise<BranchLoginResponse> {
  const res = await fetch(`${API_BASE}/api/branch-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || "Branch login failed.");
  return json as BranchLoginResponse;
}

// Grouped permission definitions for the checkboxes UI
export const PERMISSION_GROUPS = [
  {
    group: "Sales",
    items: [
      { key: "hub-sales",       label: "Hub Sales" },
      { key: "client-accounts", label: "Client Accounts" },
      { key: "collections",     label: "Collections" },
      { key: "slaughter",       label: "Slaughter" },
      { key: "dead-stock",      label: "Dead Stock" },
    ],
  },
  {
    group: "Stock",
    items: [
      { key: "species", label: "Species" },
      { key: "clients", label: "Clients" },
    ],
  },
  {
    group: "Reports",
    items: [
      { key: "reports", label: "Reports" },
    ],
  },
  {
    group: "Finance",
    items: [
      { key: "invoices",      label: "Invoices" },
      { key: "statements",    label: "Statements" },
      { key: "recon",         label: "Recon" },
      { key: "sales-summary", label: "Sales Summary" },
      { key: "stock-movement",label: "Stock Movement" },
      { key: "cost-averages", label: "Cost Averages" },
      { key: "petty-cash",    label: "Petty Cash" },
    ],
  },
  {
    group: "Procurement",
    items: [
      { key: "procurement-orders", label: "Orders" },
      { key: "inbound-shipments",  label: "Inbound Shipments" },
      { key: "suppliers",          label: "Suppliers" },
    ],
  },
  {
    group: "Admin",
    items: [
      { key: "staff", label: "Staff" },
    ],
  },
  {
    group: "Fleet",
    items: [
      { key: "vehicle-tracking", label: "Vehicle Tracking" },
      { key: "fleet",            label: "Vehicles" },
      { key: "fuel",             label: "Fuel" },
    ],
  },
] as const;
