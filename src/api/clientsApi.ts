import { api } from "./apiClient";

export type ClientType = 0 | 1 | 2; // 0=CODCASH, 1=CODEFT, 2=Credit

export type ClientDto = {
  clientId: string;
  clientName: string;
  clientAddress: string;
  clientCity: string;
  clientProvince: string;
  clientPostalCode: string;
  clientContactDetails: string;
  clientPhone: string;
  clientType: ClientType;
  isWalkIn: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type CreateClientRequest = {
  clientName: string;
  clientAddress: string;
  clientCity: string;
  clientProvince: string;
  clientPostalCode: string;
  clientContactDetails: string;
  clientPhone: string;
  clientType: ClientType;
  isWalkIn?: boolean;
};

export type UpdateClientRequest = CreateClientRequest;

export const clientsApi = {
  list: (limit = 500) => api.get<ClientDto[]>(`/api/Clients?limit=${limit}`),
  getById: (clientId: string) => api.get<ClientDto>(`/api/Clients/${clientId}`),
  create: (body: CreateClientRequest) => api.post<ClientDto>("/api/Clients", body),
  update: (clientId: string, body: UpdateClientRequest) => api.put<ClientDto>(`/api/Clients/${clientId}`, body),
  remove: (clientId: string) => api.del<void>(`/api/Clients/${clientId}`),
};