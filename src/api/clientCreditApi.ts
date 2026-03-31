import { api } from "./apiClient";

export type ClientCreditEntryDto = {
  entryId: string;
  clientId: string;
  amount: number;           // positive = deposit, negative = charge
  entryType: string;        // Deposit | InvoiceCharge | ManualAdjustment
  paymentMethod: string;    // Cash | EFT | CardMachine | ""
  reference: string;
  notes: string;
  createdByUserId: string;
  createdAt: string;
};

export type ClientCreditLedgerDto = {
  clientId: string;
  clientName: string;
  balance: number;
  entries: ClientCreditEntryDto[];
};

export type AddCreditDepositRequest = {
  amount: number;
  paymentMethod: "Cash" | "EFT" | "CardMachine";
  notes?: string;
};

export const clientCreditApi = {
  getLedger: (clientId: string) =>
    api.get<ClientCreditLedgerDto>(`/api/clients/${clientId}/credit`),

  getBalance: (clientId: string) =>
    api.get<{ balance: number }>(`/api/clients/${clientId}/credit/balance`),

  addDeposit: (clientId: string, req: AddCreditDepositRequest) =>
    api.post<ClientCreditEntryDto>(`/api/clients/${clientId}/credit`, req),
};
