import { api } from "./apiClient";

// ── Types ──────────────────────────────────────────────────────────────────

export type BankTransactionResponse = {
  transactionId: string;
  date: string;          // "yyyy-MM-dd"
  description: string;
  reference: string;
  amount: number;
  type: string;          // "Credit" | "Debit"
  isAllocated: boolean;
  allocatedInvoiceId: string;
  allocatedInvoiceNumber: string;
  allocatedAt: string | null;
};

export type BankStatementResponse = {
  statementId: string;
  fileName: string;
  s3Key: string;
  transactionCount: number;
  creditCount: number;
  totalCredits: number;
  allocatedCount: number;
  uploadedAt: string;
  transactions: BankTransactionResponse[];
};

export type BankStatementSummaryResponse = {
  statementId: string;
  fileName: string;
  transactionCount: number;
  creditCount: number;
  totalCredits: number;
  allocatedCount: number;
  uploadedAt: string;
};

export type ProcessBankStatementRequest = {
  s3Key: string;
  fileName: string;
};

export type AllocateBankTransactionRequest = {
  invoiceId: string;
};

// ── API ────────────────────────────────────────────────────────────────────

export const bankStatementsApi = {
  /** Get a presigned S3 URL to upload a CSV bank statement. */
  getUploadUrl: (fileName: string) =>
    api.get<{ uploadUrl: string; s3Key: string }>(
      `/api/bank-statements/upload-url?fileName=${encodeURIComponent(fileName)}`
    ),

  /** After uploading to S3, tell the backend to parse the CSV and create the statement record. */
  process: (req: ProcessBankStatementRequest) =>
    api.post<BankStatementResponse>("/api/bank-statements", req),

  /** List all bank statements (summary only, no transactions). */
  list: () =>
    api.get<BankStatementSummaryResponse[]>("/api/bank-statements"),

  /** Get a single bank statement with all transactions. */
  get: (statementId: string) =>
    api.get<BankStatementResponse>(`/api/bank-statements/${statementId}`),

  /** Allocate a bank transaction to an invoice. Returns updated statement. */
  allocate: (statementId: string, transactionId: string, req: AllocateBankTransactionRequest) =>
    api.put<BankStatementResponse>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/allocate`,
      req
    ),

  /** Remove allocation from a bank transaction. Returns updated statement. */
  deallocate: (statementId: string, transactionId: string) =>
    api.del<BankStatementResponse>(
      `/api/bank-statements/${statementId}/transactions/${transactionId}/allocate`
    ),
};
