import { api } from "./apiClient";

export type StaffMemberDto = {
  staffMemberId: string;
  name: string;
  phone: string;
  department: string;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type CreateStaffMemberRequest = {
  name: string;
  phone: string;
  department: string;
};

export type UpdateStaffMemberRequest = {
  name: string;
  phone: string;
  department: string;
  isActive: boolean;
};

export const staffMembersApi = {
  list: () => api.get<StaffMemberDto[]>("/api/staff-members"),
  getById: (id: string) => api.get<StaffMemberDto>(`/api/staff-members/${id}`),
  create: (req: CreateStaffMemberRequest) => api.post<StaffMemberDto>("/api/staff-members", req),
  update: (id: string, req: UpdateStaffMemberRequest) => api.put<StaffMemberDto>(`/api/staff-members/${id}`, req),
};
