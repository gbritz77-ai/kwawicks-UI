import { api } from "./apiClient";

export type SpeciesResponse = {
  speciesId: string;
  name: string;
  unitCost: number;
  sellPrice: number | null;
  isActive: boolean;
  createdAtUtc: string;
};

export type CreateSpeciesRequest = {
  name: string;
  unitCost: number;
  sellPrice?: number | null;
};

export type UpdateSpeciesRequest = {
  name: string;
  unitCost: number;
  sellPrice?: number | null;
  isActive: boolean;
};

export const speciesApi = {
  list: () => api.get<SpeciesResponse[]>("/api/species"),
  create: (body: CreateSpeciesRequest) => api.post<SpeciesResponse>("/api/species", body),
  update: (speciesId: string, body: UpdateSpeciesRequest) =>
    api.put<SpeciesResponse>(`/api/species/${encodeURIComponent(speciesId)}`, body),
};