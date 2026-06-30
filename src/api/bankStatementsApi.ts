import { api } from "./apiClient";

// ── Types ──────────────────────────────────────────────────────────────────

export type BankTransactionResponse = {
  transactionId: string;
  date: string;                   // "yyyy-MM-dd"
  description: string;
  reference: string;
  amount: number;
  type: string;                   // "Credit" | "Debit"
  isAllocated: boolean;
  allocationType: string;         // "Invoice" | "NonClient" | "Supplier" | ""
  allocatedInvoiceId: string;
  allocatedInvoiceNumber: string;
  nonClientDescription: string;
  allocatedSupplierId: string;
  allocatedSupplierName: string;
  allocatedClientId: string;
  allocatedClientName: string;
  allocatedAt: string | null;
  /** True when this unallocated credit matches (same date + amount) a transaction that was
   * already allocated under a different, previously-imported statement. */
  isPossibleDuplicate: boolean;
  duplicateOfStatementFileName: string;
  duplicateOfAllocationSummary: string;
  duplicateOfAllocatedAt: string | null;
};

export type BankStatementResponse = {
  statementId: string;
  fileName: string;
  s3Key: string;
  transactionCount: number;
  creditCount: number;
  totalCredits: number;
  allocatedCount: number;
  unallocatedCount: number;
  unallocatedAmount: number;
  uploadedAt: string;
  transactions: BankTransactionResponse[];
  possibleDuplicates: BankTransactionResponse[];
};

export type BankStatementSummaryResponse = {
  statementId: string;
  fileName: string;
  transactionCount: number;
  creditCount: number;
  totalCredits: number;
  allocatedCount: number;
  unallocatedCount: number;
  unallocatedAmount: number;
  uploadedAt: string;
};

export type AllocationWarning = {
  code: string;              // "AMOUNT_MISMATCH"
  message: string;
  bankAmount: number;
  allocationAmount: number;
  difference: number;
};

export type AllocateResponse = {
  statement: BankStatementResponse;
  warning?: AllocationWarning;
};

export type ProcessBankStatementRequest = {
  s3Key: string;
  fileName: string;
};

export type AllocateBankTransactionRequest = {
  invoiceId: string;
};

export type AllocateNonClientRequest = {
  description: string;
  amount: number;
};

export type AllocateSupplierRequest = {
  supplierId: string;
  notes?: string;
};

export type AllocateClientCreditRequest = {
  clientId: string;
  notes?: string;
};

export type BankReconAllocationReportItem = {
  statementId: string;
  fileName: string;
  transactionId: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  type: string;
  allocationType: string;         // "Invoice" | "NonClient" | "Supplier"
  allocatedInvoiceId: string;
  allocatedInvoiceNumber: string;
  nonClientDescription: string;
  allocatedSupplierId: string;
  allocatedSupplierName: string;
  allocatedClientId: string;
  allocatedClientName: string;
  allocatedAt: string | null;
};

// ── API ────────────────────────────────────────────────────────────────────

export const bankStatementsApi = {
  /** Presigned S3 URL to upload a CSV bank statement. */
  getUploadUrl: (fileName: string) =>
    api.get<{ uploadUrl: string; s3Key: string }>(
      `/api/bank-statements/upload-url?fileName=${encodeURIComponent(fileName)}`
    ),

  /** After uploading to S3, tell the backend to parse and store the statement. */
  process: (req: ProcessBankStatementRequest) =>
    api.post<BankStatementResponse>("/api/bank-statements", req),

  /** List all statements (summary only). */
  list: () =>
    api.get<BankStatementSummaryResponse[]>("/api/bank-statements"),

  /** Get a single statement with all transactions. Optionally filter transactions server-side. */
  get: (statementId: string, params?: { search?: string; amount?: number }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.amount != null) qs.set("amount", String(params.amount));
    const q = qs.toString();
    return api.get<BankStatementResponse>(`/api/bank-statements/${statementId}${q ? `?${q}` : ""}`);
  },

  /** Smart match: pending invoices whose amount matches this transaction (+ optional name search). */
  getMatches: (statementId: string, transactionId: string, search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return api.get<import("./invoicesApi").ReconInvoiceItem[]>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/matches${qs}`
    );
  },

  /** Allocate a bank transaction to a client invoice. Returns updated statement + optional warning. */
  allocate: (statementId: string, transactionId: string, req: AllocateBankTransactionRequest) =>
    api.put<AllocateResponse>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/allocate`,
      req
    ),

  /** Allocate a bank transaction to a non-client entry (bank fee, misc income, etc). */
  allocateNonClient: (statementId: string, transactionId: string, req: AllocateNonClientRequest) =>
    api.put<AllocateResponse>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/allocate-non-client`,
      req
    ),

  /** Allocate a bank credit transaction to a client's credit account. Returns updated statement. */
  allocateClientCredit: (statementId: string, transactionId: string, req: AllocateClientCreditRequest) =>
    api.put<AllocateResponse>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/allocate-client-credit`,
      req
    ),

  /** Allocate a bank transaction (debit) to a supplier. Returns updated statement. */
  allocateSupplier: (statementId: string, transactionId: string, req: AllocateSupplierRequest) =>
    api.put<AllocateResponse>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/allocate-supplier`,
      req
    ),

  /** Remove allocation from a bank transaction. Returns updated statement. */
  deallocate: (statementId: string, transactionId: string) =>
    api.del<BankStatementResponse>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/allocate`
    ),

  /** Allocation report across all statements. */
  getAllocationReport: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to)   qs.set("to",   params.to);
    const q = qs.toString();
    return api.get<BankReconAllocationReportItem[]>(`/api/bank-statements/allocation-report${q ? `?${q}` : ""}`);
  },
};
