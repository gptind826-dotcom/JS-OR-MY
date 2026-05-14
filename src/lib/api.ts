// API client for Noxylity backend

const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("noxylity_token");
}

async function fetchJson(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem("noxylity_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  auth: {
    login: (password: string) =>
      fetchJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    verify: () => fetchJson("/auth/verify"),
  },
  projects: {
    list: () => fetchJson("/projects"),
    create: (formData: FormData) =>
      fetch("/api/projects", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() || ""}` },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Unknown" }));
          throw new Error(err.detail);
        }
        return res.json();
      }),
    run: (id: string, mainFile: string) =>
      fetchJson(`/projects/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ mainFile }),
      }),
    stop: (id: string) =>
      fetchJson(`/projects/${id}/stop`, { method: "POST", body: JSON.stringify({}) }),
    delete: (id: string) =>
      fetchJson(`/projects/${id}`, { method: "DELETE" }),
    sendInput: (id: string, input: string) =>
      fetchJson(`/projects/${id}/input`, {
        method: "POST",
        body: JSON.stringify({ input }),
      }),
    clearLogs: (id: string) =>
      fetchJson(`/projects/${id}/clear-logs`, { method: "POST", body: JSON.stringify({}) }),
  },
  settings: {
    get: () => fetchJson("/settings"),
    validate: (botToken: string, channelId: string) =>
      fetchJson("/settings/validate", {
        method: "POST",
        body: JSON.stringify({ botToken, channelId }),
      }),
  },
};
