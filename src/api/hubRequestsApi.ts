import { api } from "./apiClient";

export type HubRequestDto = {
  hubRequestId: string;
  requestedBy: string;
  message: string;
  status: "Pending" | "Actioned" | "Cancelled";
  actionedBy: string;
  actionNotes: string;
  linkedOrderId: string;
  linkedOrderType: string;
  linkedOrderRef: string;
  whatsAppError?: string;
  createdAtUtc: string;
  actionedAtUtc?: string;
};

export type CreateHubRequestRequest = {
  message: string;
};

export type ActionHubRequestRequest = {
  actionNotes: string;
  linkedOrderId: string;
  linkedOrderType: string;
  linkedOrderRef: string;
};

export const hubRequestsApi = {
  list: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return api.get<HubRequestDto[]>(`/api/hub-requests${qs}`);
  },
  get: (id: string) => api.get<HubRequestDto>(`/api/hub-requests/${id}`),
  create: (req: CreateHubRequestRequest) =>
    api.post<HubRequestDto>("/api/hub-requests", req),
  action: (id: string, req: ActionHubRequestRequest) =>
    api.put<HubRequestDto>(`/api/hub-requests/${id}/action`, req),
  cancel: (id: string) =>
    api.put<HubRequestDto>(`/api/hub-requests/${id}/cancel`),
};
