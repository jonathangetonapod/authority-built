import { useParams } from 'react-router-dom'
import WorkspaceUniversity from '@/pages/app/WorkspaceUniversity'

/** Platform-admin wrapper: the same page, bound to an explicitly selected workspace. */
const AdminWorkspaceUniversity = () => {
  const { workspaceId = '' } = useParams()
  return (
    <WorkspaceUniversity
      key={workspaceId || 'missing'}
      platformWorkspaceId={workspaceId}
    />
  )
}

export default AdminWorkspaceUniversity
