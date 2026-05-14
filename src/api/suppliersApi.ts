import { api } from "./apiClient";

// ── Types ──────────────────────────────────────────────────────────────────

export type SupplierAddressDto = {
  street: string;
  city: string;
  province: string;
  postalCode: string;
};

export type SupplierContactDto = {
  name: string;
  phone: string;
};

export type SupplierContactFinanceDto = {
  name: string;
  phone: string;
  email: string;
};

export type SupplierBankDetailsDto = {
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
};

export type SupplierResponse = {
  supplierId: string;
  name: string;
  address: SupplierAddressDto;
  contactPerson: SupplierContactDto;
  contactFinance: SupplierContactFinanceDto;
  bankDetails: SupplierBankDetailsDto;
  createdAt: string;
  updatedAt: string;
};

// ── API ────────────────────────────────────────────────────────────────────

export const suppliersApi = {
  list: () =>
    api.get<SupplierResponse[]>("/api/suppliers"),

  get: (supplierId: string) =>
    api.get<SupplierResponse>(`/api/suppliers/${supplierId}`),
};
