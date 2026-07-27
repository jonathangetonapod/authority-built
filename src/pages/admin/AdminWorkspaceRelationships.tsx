import { useParams } from 'react-router-dom'
import WorkspaceRelationships from '@/pages/app/WorkspaceRelationships'

/** Platform-admin wrapper: the same page, bound to an explicitly selected workspace. */
const AdminWorkspaceRelationships = () => {
  const { workspaceId = '' } = useParams()
  return (
    <WorkspaceRelationships
      key={workspaceId || 'missing'}
      platformWorkspaceId={workspaceId}
    />
  )
}

export default AdminWorkspaceRelationships
