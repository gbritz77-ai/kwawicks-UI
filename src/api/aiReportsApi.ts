import { api } from "./apiClient";

export type AiReportRequest = {
  prompt: string;
};

export type AiReportResult = {
  narrative: string;
  columns: string[];
  rows: string[][];
};

export const aiReportsApi = {
  query: (prompt: string) =>
    api.post<AiReportResult>("/api/ai-reports/query", { prompt }),
};
