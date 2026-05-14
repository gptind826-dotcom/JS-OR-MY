import { Routes, Route, Navigate } from "react-router";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import SettingsPage from "./pages/Settings";
import { useAuth } from "./hooks/useAuth";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #2a2520 50%, #1a1a1a 100%)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#7cb342] border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-sm" style={{ color: "rgba(245,243,240,0.5)" }}>Initializing...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#2a2520" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#7cb342] border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-sm" style={{ color: "rgba(245,243,240,0.5)" }}>Initializing...</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
