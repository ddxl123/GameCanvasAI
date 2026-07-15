import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import Toaster from "@/components/ui/Toaster";

const Home = lazy(() => import("@/pages/Home"));
const Settings = lazy(() => import("@/pages/Settings"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ProjectLayout = lazy(() => import("@/components/layout/ProjectLayout"));

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="text-ink-muted animate-pulse">加载中…</div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas gap-3">
      <div className="text-4xl font-bold text-ink-muted">404</div>
      <div className="text-sm text-ink-secondary">页面不存在</div>
      <Link to="/" className="btn-primary mt-2">返回首页</Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/project/:projectId" element={<ProjectLayout />}>
            <Route index element={<Navigate to="workspace" replace />} />
            <Route path="workspace" element={<Workspace />} />
            <Route path="mechanism" element={<Workspace />} />
            <Route path="dashboard" element={<Dashboard />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
