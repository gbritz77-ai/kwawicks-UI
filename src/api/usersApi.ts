import { api } from "./apiClient";

export type DriverDto = {
  userId: string;
  name: string;
  email: string;
};

export type UserDto = {
  username: string;
  group: string;
  enabled: boolean;
  userStatus: string;
};

export type CreateUserRequest = {
  username: string;
  pin: string;
  group: string;
};

export type SetPinRequest = {
  pin: string;
};

export type UpdateGroupRequest = {
  newGroup: string;
  oldGroup: string;
};

export const usersApi = {
  listDrivers: () => api.get<DriverDto[]>("/api/drivers"),

  list: () => api.get<UserDto[]>("/api/users"),

  create: (req: CreateUserRequest) =>
    api.post<UserDto>("/api/users", req),

  setPin: (username: string, req: SetPinRequest) =>
    api.put<void>(`/api/users/${encodeURIComponent(username)}/pin`, req),

  updateGroup: (username: string, req: UpdateGroupRequest) =>
    api.put<void>(`/api/users/${encodeURIComponent(username)}/group`, req),

  deleteUser: (username: string) =>
    api.del<void>(`/api/users/${encodeURIComponent(username)}`),
};
