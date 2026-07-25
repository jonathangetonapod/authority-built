import { useParams } from 'react-router-dom'
import WorkspaceClientPodcastSystem from '@/pages/app/WorkspaceClientPodcastSystem'

const AdminWorkspaceClientPodcastSystem = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceClientPodcastSystem key={workspaceId || 'missing'} platformWorkspaceId={workspaceId} />
}

export default AdminWorkspaceClientPodcastSystem
