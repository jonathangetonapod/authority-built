import { useParams } from 'react-router-dom'
import WorkspaceProspectDashboards from '@/pages/app/WorkspaceProspectDashboards'

const AdminWorkspaceProspectDashboards = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceProspectDashboards key={workspaceId || 'missing'} platformWorkspaceId={workspaceId} />
}

export default AdminWorkspaceProspectDashboards
