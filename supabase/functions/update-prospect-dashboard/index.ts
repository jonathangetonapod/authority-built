import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  jsonResponse,
  optionsResponse,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Retired: a pre-toolkit function that updated a prospect dashboard by bare
// prospect id with no workspace scoping, no audit, and no pending-review
// model — bypassing everything workspace-prospect-dashboards enforces. Nothing
// calls it. Kept as a 410 so any lingering caller is told, not silently served.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'This endpoint is retired; use workspace-prospect-dashboards',
    code: 'PROSPECT_UPDATE_DISABLED',
  })
})
