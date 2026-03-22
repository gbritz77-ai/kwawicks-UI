import { api } from "./apiClient";

export type WhatsAppSendResult = {
  success: boolean;
  message: string;
};

export const whatsappApi = {
  sendInvoice: (invoiceId: string, phone: string) =>
    api.post<WhatsAppSendResult>(`/api/whatsapp/invoice/${invoiceId}`, { phone }),

  sendStatement: (clientId: string, phone: string, from?: string, to?: string) =>
    api.post<WhatsAppSendResult>(`/api/whatsapp/statement/${clientId}`, { phone, from, to }),
};
