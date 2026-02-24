import React from "react";
import { Navigate } from "react-router-dom";
import { isLoggedIn } from "../api/auth";

type RequireAuthProps = {
  children: React.ReactElement;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}