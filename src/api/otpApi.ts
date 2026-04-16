import { api } from "./apiClient";

export type OtpRecordDto = {
  otpId: string;
  invoiceId: string;
  invoiceNumber: string;
  referenceType: string;  // "HubSale" | "DriverSale"
  clientId: string;
  clientName: string;
  clientPhone: string;
  invoiceTotal: number;
  status: string;          // "Pending" | "Confirmed" | "Expired" | "Bypassed"
  sentAt: string;
  expiresAt: string;
  confirmedAt?: string;
  confirmedByUserId?: string;
  bypassReason?: string;
  isResolved: boolean;
};

export const otpApi = {
  verify: (invoiceId: string, code: string) =>
    api.post<OtpRecordDto>(`/api/otp/${invoiceId}/verify`, { code }),

  resend: (invoiceId: string) =>
    api.post<OtpRecordDto>(`/api/otp/${invoiceId}/resend`, {}),

  bypass: (invoiceId: string, reason?: string) =>
    api.post<OtpRecordDto>(`/api/otp/${invoiceId}/bypass`, { reason }),

  report: (params?: { clientId?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.clientId) qs.set("clientId", params.clientId);
    if (params?.from)     qs.set("from",     params.from);
    if (params?.to)       qs.set("to",       params.to);
    const q = qs.toString();
    return api.get<OtpRecordDto[]>(`/api/otp/report${q ? "?" + q : ""}`);
  },
};
