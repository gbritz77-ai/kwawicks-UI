import { api } from "./apiClient";

export type AppSettingsDto = {
  hubWhatsAppNumber: string;
  updatedAtUtc?: string;
  updatedBy: string;
};

export type UpdateAppSettingsRequest = {
  hubWhatsAppNumber: string;
};

export const settingsApi = {
  get: () => api.get<AppSettingsDto>("/api/settings"),
  update: (req: UpdateAppSettingsRequest) =>
    api.put<AppSettingsDto>("/api/settings", req),
};
