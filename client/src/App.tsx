import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { AdminPage } from "./pages/AdminPage";
import { TeacherPage } from "./pages/TeacherPage";
import { StudentPage } from "./pages/StudentPage";

// The kiosk page pulls in the QR-scanning decoder (a large dependency) — lazy
// load it so that bundle only ships to the /kiosk route, not every dashboard.
const KioskPage = lazy(() => import("./pages/KioskPage").then((m) => ({ default: m.KioskPage })));

function PageFallback() {
  return <div className="flex h-screen items-center justify-center text-sm text-muted">Loading…</div>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/kiosk"
        element={
          <Suspense fallback={<PageFallback />}>
            <KioskPage />
          </Suspense>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="TEACHER">
            <TeacherPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
