import { api } from "./apiClient";

export type SupplierAddress = { street: string; city: string; province: string; postalCode: string; };
export type SupplierContact = { name: string; phone: string; };
export type SupplierContactFinance = { name: string; phone: string; email: string; };
export type SupplierBankDetails = { bankName: string; accountNumber: string; branchCode: string; accountType: string; };

export type SupplierDto = {
  supplierId: string;
  name: string;
  address: SupplierAddress;
  contactPerson: SupplierContact;
  contactFinance: SupplierContactFinance;
  bankDetails: SupplierBankDetails;
  createdAt: string;
  updatedAt: string;
};

/** Alias used by ReconPage */
export type SupplierResponse = SupplierDto;

export type CreateSupplierRequest = {
  name: string;
  address: SupplierAddress;
  contactPerson: SupplierContact;
  contactFinance: SupplierContactFinance;
  bankDetails: SupplierBankDetails;
};

export const emptySupplier = (): CreateSupplierRequest => ({
  name: "",
  address: { street: "", city: "", province: "", postalCode: "" },
  contactPerson: { name: "", phone: "" },
  contactFinance: { name: "", phone: "", email: "" },
  bankDetails: { bankName: "", accountNumber: "", branchCode: "", accountType: "Current" },
});

export const suppliersApi = {
  list: () => api.get<SupplierDto[]>("/api/suppliers"),
  get: (id: string) => api.get<SupplierDto>(`/api/suppliers/${id}`),
  create: (req: CreateSupplierRequest) => api.post<SupplierDto>("/api/suppliers", req),
  update: (id: string, req: CreateSupplierRequest) => api.put<SupplierDto>(`/api/suppliers/${id}`, req),
  remove: (id: string) => api.del(`/api/suppliers/${id}`),
};
