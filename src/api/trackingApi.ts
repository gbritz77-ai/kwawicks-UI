import { api } from "./apiClient";

export type RecordLocationRequest = {
  latitude:        number;
  longitude:       number;
  accuracy?:       number;
  speed?:          number;
  deliveryOrderId?: string;
};

export type LiveVehicleResponse = {
  driverId:            string;
  driverName:          string;
  latitude:            number;
  longitude:           number;
  accuracy?:           number;
  speed?:              number;
  lastSeen:            string;  // ISO
  deliveryOrderId?:    string;
  minutesSinceLastPing: number;
};

export type LocationHistoryPoint = {
  latitude:   number;
  longitude:  number;
  recordedAt: string; // ISO
};

export type DriverRouteResponse = {
  driverId:   string;
  driverName: string;
  points:     LocationHistoryPoint[];
};

export const trackingApi = {
  /** Driver: record current GPS position. */
  recordLocation: (req: RecordLocationRequest) =>
    api.post<void>("/api/tracking/location", req),

  /** Admin: latest position for every driver. */
  getLive: () =>
    api.get<LiveVehicleResponse[]>("/api/tracking/live"),

  /** Admin: breadcrumb route for one driver (default last 24 h). */
  getHistory: (driverId: string, hours = 24) =>
    api.get<DriverRouteResponse>(`/api/tracking/history/${encodeURIComponent(driverId)}?hours=${hours}`),
};
