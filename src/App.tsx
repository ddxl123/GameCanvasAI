import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
