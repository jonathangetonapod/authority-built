import { useParams } from 'react-router-dom'
import WorkspaceSmartPodcastFinder from '@/pages/app/WorkspaceSmartPodcastFinder'

/*
 * The Smart Finder for a workspace a platform admin is viewing. Without it the
 * platform address for this module resolved to the advanced finder, so the same
 * sidebar item opened one page for an agency's own people and a different one
 * for the operator looking at them.
 */
const AdminWorkspaceSmartPodcastFinder = () => {
  const { workspaceId = '' } = useParams()
  return (
    <WorkspaceSmartPodcastFinder
      key={workspaceId || 'missing'}
      platformWorkspaceId={workspaceId}
    />
  )
}

export default AdminWorkspaceSmartPodcastFinder
