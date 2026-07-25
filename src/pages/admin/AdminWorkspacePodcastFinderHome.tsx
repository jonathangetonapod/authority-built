import { useParams, useSearchParams } from 'react-router-dom'
import PodcastFinder from '@/pages/admin/PodcastFinder'

const AdminWorkspacePodcastFinderHome = () => {
  const { workspaceId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialClientId = searchParams.get('client') || undefined
  const initialProspectId = searchParams.get('prospect') || undefined
  return (
    <PodcastFinder
      key={`${workspaceId || 'missing'}:${initialProspectId ? `prospect:${initialProspectId}` : initialClientId || 'workspace-default'}`}
      initialClientId={initialClientId}
      initialProspectId={initialProspectId}
      platformWorkspaceId={workspaceId}
      workspaceScoped
    />
  )
}

export default AdminWorkspacePodcastFinderHome
