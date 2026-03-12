import { api } from "./apiClient";

export type DriverDto = {
  userId: string;
  name: string;
  email: string;
};

export const usersApi = {
  listDrivers: () => api.get<DriverDto[]>("/api/users/drivers"),
};
