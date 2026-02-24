import React from "react";
import { Navigate } from "react-router-dom";
import { hasRole, isLoggedIn } from "../api/auth";

type RequireRoleProps = {
  role: string;
  children: React.ReactElement;
};

export default function RequireRole({ role, children }: RequireRoleProps) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!hasRole(role)) return <Navigate to="/app" replace />;
  return children;
}