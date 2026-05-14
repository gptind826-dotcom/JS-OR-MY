import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("noxylity_token");
    if (!token) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }
    api.auth
      .verify()
      .then(() => {
        setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem("noxylity_token");
        setIsAuthenticated(false);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (password: string) => {
    try {
      const res = await api.auth.login(password);
      if (res.token) {
        localStorage.setItem("noxylity_token", res.token);
        setIsAuthenticated(true);
        return { success: true };
      }
      return { success: false, error: "Invalid response" };
    } catch (e: any) {
      return { success: false, error: e.message || "Login failed" };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("noxylity_token");
    setIsAuthenticated(false);
    window.location.href = "/login";
  }, []);

  return { isAuthenticated, isLoading, login, logout };
}
