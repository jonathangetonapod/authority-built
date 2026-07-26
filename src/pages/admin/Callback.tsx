import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const AuthCallback = () => {
  const { accountState } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (accountState === 'loading') return
    if (accountState === 'pending') {
      navigate('/accept-invite', { replace: true })
    } else if (accountState === 'password_change_required' || accountState === 'reauthentication_required') {
      navigate('/change-password', { replace: true })
    } else if (accountState === 'active') {
      navigate('/app/clients', { replace: true })
    } else {
      navigate('/admin/login', { replace: true })
    }
  }, [accountState, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}

export default AuthCallback
