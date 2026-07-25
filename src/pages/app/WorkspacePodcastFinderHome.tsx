import { useSearchParams } from 'react-router-dom'
import PodcastFinder from '@/pages/admin/PodcastFinder'

const WorkspacePodcastFinderHome = () => {
  const [searchParams] = useSearchParams()
  const initialClientId = searchParams.get('client') || undefined
  const initialProspectId = searchParams.get('prospect') || undefined
  return (
    <PodcastFinder
      key={initialProspectId ? `prospect:${initialProspectId}` : initialClientId || 'workspace-default'}
      initialClientId={initialClientId}
      initialProspectId={initialProspectId}
      workspaceScoped
    />
  )
}

export default WorkspacePodcastFinderHome
