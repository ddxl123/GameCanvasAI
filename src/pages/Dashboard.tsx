import { useParams } from "react-router-dom";
import ProjectDashboard from "@/features/dashboard/ProjectDashboard";

export default function Dashboard() {
  const { projectId } = useParams();
  if (!projectId) return null;
  return <ProjectDashboard projectId={projectId} />;
}
