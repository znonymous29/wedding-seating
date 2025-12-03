import axios from "axios";
import { useAuthStore } from "../stores/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// 创建 axios 实例
export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    // FormData 需要让浏览器自动设置 Content-Type（包含 boundary）
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as any;

    // 如果是 401 错误且未重试过，尝试刷新 token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const { refreshToken, setTokens, logout } = useAuthStore.getState();

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
            response.data.data;
          setTokens(newAccessToken, newRefreshToken);

          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          logout();
          window.location.href = "/login";
          return Promise.reject(refreshError);
        }
      } else {
        logout();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// API 类型定义
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth API
export const authApi = {
  register: (data: {
    email: string;
    password: string;
    nickname: string;
    phone?: string;
  }) => api.post<ApiResponse>("/auth/register", data),

  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse>("/auth/login", data),

  getMe: () => api.get<ApiResponse>("/auth/me"),

  updateMe: (data: { nickname?: string; avatar?: string }) =>
    api.put<ApiResponse>("/auth/me", data),

  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.put<ApiResponse>("/auth/password", data),
};

// Project API
export const projectApi = {
  getAll: () => api.get<ApiResponse>("/projects"),

  getOne: (projectId: string) => api.get<ApiResponse>(`/projects/${projectId}`),

  create: (data: {
    name: string;
    weddingDate?: string;
    venue?: string;
    defaultSeatsPerTable?: number;
  }) => api.post<ApiResponse>("/projects", data),

  update: (projectId: string, data: any) =>
    api.put<ApiResponse>(`/projects/${projectId}`, data),

  delete: (projectId: string) =>
    api.delete<ApiResponse>(`/projects/${projectId}`),

  createInvitation: (
    projectId: string,
    data: { role: string; areaId?: string; expiresInHours?: number }
  ) => api.post<ApiResponse>(`/projects/${projectId}/invitations`, data),

  joinByToken: (token: string) =>
    api.post<ApiResponse>(`/projects/join/${token}`),

  getMembers: (projectId: string) =>
    api.get<ApiResponse>(`/projects/${projectId}/members`),

  updateMember: (
    projectId: string,
    memberId: string,
    data: { role?: string; areaId?: string }
  ) => api.put<ApiResponse>(`/projects/${projectId}/members/${memberId}`, data),

  removeMember: (projectId: string, memberId: string) =>
    api.delete<ApiResponse>(`/projects/${projectId}/members/${memberId}`),
};

// Guest API
export const guestApi = {
  getAll: (
    projectId: string,
    params?: {
      search?: string;
      areaId?: string;
      tag?: string;
      assigned?: string;
      page?: number;
      limit?: number;
    }
  ) => api.get<ApiResponse>(`/guests/project/${projectId}`, { params }),

  getOne: (guestId: string) => api.get<ApiResponse>(`/guests/${guestId}`),

  create: (data: {
    projectId: string;
    name: string;
    headCount?: number;
    phone?: string;
    relationship?: string;
    tags?: string[];
    notes?: string;
    areaId?: string;
  }) => api.post<ApiResponse>("/guests", data),

  update: (guestId: string, data: any) =>
    api.put<ApiResponse>(`/guests/${guestId}`, data),

  delete: (guestId: string) => api.delete<ApiResponse>(`/guests/${guestId}`),

  batchDelete: (guestIds: string[], projectId: string) =>
    api.post<ApiResponse>("/guests/batch-delete", { guestIds, projectId }),

  import: (projectId: string, formData: FormData) =>
    api.post<ApiResponse>(`/guests/import/${projectId}`, formData),

  downloadTemplate: () =>
    api.get("/guests/template/download", { responseType: "blob" }),

  getTags: (projectId: string) =>
    api.get<ApiResponse>(`/guests/tags/${projectId}`),

  export: (projectId: string) =>
    api.get(`/guests/export/${projectId}`, { responseType: "blob" }),
};

// Table API
export const tableApi = {
  getAll: (projectId: string) =>
    api.get<ApiResponse>(`/tables/project/${projectId}`),

  getOne: (tableId: string) => api.get<ApiResponse>(`/tables/${tableId}`),

  create: (data: {
    projectId: string;
    name: string;
    capacity?: number;
    positionX?: number;
    positionY?: number;
    tableType?: string;
    tags?: string[];
    notes?: string;
    areaId?: string;
  }) => api.post<ApiResponse>("/tables", data),

  batchCreate: (data: {
    projectId: string;
    count: number;
    namePrefix?: string;
    capacity?: number;
    areaId?: string;
    startNumber?: number;
  }) => api.post<ApiResponse>("/tables/batch", data),

  update: (tableId: string, data: any) =>
    api.put<ApiResponse>(`/tables/${tableId}`, data),

  updatePositions: (
    projectId: string,
    positions: { id: string; positionX: number; positionY: number }[]
  ) =>
    api.put<ApiResponse>("/tables/positions/batch", { projectId, positions }),

  delete: (tableId: string) => api.delete<ApiResponse>(`/tables/${tableId}`),
};

// Seating API
export const seatingApi = {
  assign: (data: { guestId: string; tableId: string }) =>
    api.post<ApiResponse>("/seating/assign", data),

  unassign: (guestId: string) =>
    api.delete<ApiResponse>(`/seating/unassign/${guestId}`),

  move: (data: { guestId: string; newTableId: string }) =>
    api.put<ApiResponse>("/seating/move", data),

  addConstraint: (data: {
    projectId: string;
    guest1Id: string;
    guest2Id: string;
    constraintType: "MUST_TOGETHER" | "MUST_APART";
  }) => api.post<ApiResponse>("/seating/constraint", data),

  removeConstraint: (constraintId: string) =>
    api.delete<ApiResponse>(`/seating/constraint/${constraintId}`),

  suggest: (projectId: string, guestId: string) =>
    api.post<ApiResponse>("/seating/suggest", { projectId, guestId }),

  autoAssign: (projectId: string) =>
    api.post<ApiResponse>("/seating/auto-assign", { projectId }),
};

// Area API
export const areaApi = {
  getAll: (projectId: string) =>
    api.get<ApiResponse>(`/areas/project/${projectId}`),

  create: (data: {
    projectId: string;
    name: string;
    color?: string;
    managerId?: string;
  }) => api.post<ApiResponse>("/areas", data),

  update: (
    areaId: string,
    data: { name?: string; color?: string; managerId?: string }
  ) => api.put<ApiResponse>(`/areas/${areaId}`, data),

  delete: (areaId: string) => api.delete<ApiResponse>(`/areas/${areaId}`),
};
