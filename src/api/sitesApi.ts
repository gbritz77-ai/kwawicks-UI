import { api } from "./apiClient";

export type SiteDto = {
  siteId: string;
  name: string;
  address: string;
  contactName: string;
  contactPhone: string;
  isActive: boolean;
};

export type CreateSiteRequest = {
  name: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
};

export const sitesApi = {
  list: () => api.get<SiteDto[]>("/api/sites"),
  create: (req: CreateSiteRequest) => api.post<SiteDto>("/api/sites", req),
};
