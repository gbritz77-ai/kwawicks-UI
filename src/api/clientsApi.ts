import { api } from "./apiClient";

export type ClientType = 0 | 1; // 0=COD, 1=Credit

export type ClientDto = {
  clientId: string;
  clientName: string;
  clientAddress: string;
  clientContactDetails: string;
  clientType: ClientType;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type CreateClientRequest = {
  clientName: string;
  clientAddress: string;
  clientContactDetails: string;
  clientType: ClientType;
};

export type UpdateClientRequest = CreateClientRequest;

export const clientsApi = {
  list: (limit = 100) => api.get<ClientDto[]>(`/api/Clients?limit=${limit}`),
  create: (body: CreateClientRequest) => api.post<ClientDto>("/api/Clients", body),
  update: (clientId: string, body: UpdateClientRequest) => api.put<ClientDto>(`/api/Clients/${clientId}`, body),
  remove: (clientId: string) => api.del<void>(`/api/Clients/${clientId}`),
};