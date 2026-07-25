import { useParams } from 'react-router-dom'
import WorkspacePodcastDatabase from '@/pages/app/WorkspacePodcastDatabase'

const AdminWorkspacePodcastDatabase = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspacePodcastDatabase key={workspaceId || 'missing'} platformWorkspaceId={workspaceId} />
}

export default AdminWorkspacePodcastDatabase
