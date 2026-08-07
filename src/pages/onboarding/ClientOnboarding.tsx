import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileText, Image as ImageIcon, Loader2, LockKeyhole, MessageSquareMore, RefreshCw, Save, Trash2, UploadCloud } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import PageSEO from '@/components/seo/PageSEO'
import { onboardingAccentColor, onboardingAccentHsl, onboardingFaviconDataUrl, onboardingWorkspaceInitials, renderOnboardingBrandText } from '@/lib/onboardingBrand'
import {
  deleteClientOnboardingAsset,
  getClientOnboarding,
  saveClientOnboarding,
  submitClientOnboarding,
  uploadClientOnboardingAsset,
  type ClientOnboardingView,
  type OnboardingQuestion,
} from '@/services/workspaceOnboarding'

const CAPABILITY_SCOPE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([1-9][0-9]{0,9})\./iu

function emptyAnswer(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function sectionError(view: ClientOnboardingView, answers: Record<string, unknown>, sectionIndex: number): string | null {
  const section = view.definition?.sections[sectionIndex]
  if (!section) return 'This section is unavailable.'
  for (const question of section.questions) {
    const label = renderOnboardingBrandText(question.label, view.workspace.name)
    if (question.required && emptyAnswer(answers[question.id])) return `${label} is required.`
  }
  return null
}

const ClientBrandHead = ({ view, logoUnavailable }: { view: ClientOnboardingView; logoUnavailable: boolean }) => {
  const accent = onboardingAccentColor(view.accent_color)
  const title = `${view.workspace.name} · Client onboarding`
  const cardTitle = 'Complete your client intake'
  const description = `Complete your private onboarding securely with ${view.workspace.name}.`
  const previewImage = `${window.location.origin}/onboarding-link-preview.png?accent=${accent.slice(1)}`
  const fallbackIcon = `${window.location.origin}/onboarding-link-icon.png?accent=${accent.slice(1)}`
  const favicon = view.workspace.logo_url && !logoUnavailable
    ? view.workspace.logo_url
    : onboardingFaviconDataUrl(view.workspace.name, accent)
  const touchIcon = view.workspace.logo_url && !logoUnavailable ? view.workspace.logo_url : fallbackIcon
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="author" content={view.workspace.name} />
      <meta name="application-name" content={view.workspace.name} />
      <meta name="apple-mobile-web-app-title" content={view.workspace.name} />
      <meta name="theme-color" content={accent} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={cardTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={view.workspace.name} />
      <meta property="og:image" content={previewImage} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Secure client onboarding" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={cardTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={previewImage} />
      <link rel="icon" href={favicon} />
      <link rel="apple-touch-icon" sizes="180x180" href={touchIcon} />
    </Helmet>
  )
}

const ClientOnboarding = () => {
  const { token = '' } = useParams()
  // Staff opening the link to check it before sharing must not stamp
  // viewed_at — the team reads that as the client's first open.
  const staffPreview = new URLSearchParams(window.location.search).get('preview') === 'staff'
  const queryClient = useQueryClient()
  const onboardingQueryKey = useMemo(() => {
    const capabilityScope = token.match(CAPABILITY_SCOPE_PATTERN)
    return ['client-onboarding-public', capabilityScope ? `${capabilityScope[1].toLowerCase()}:${capabilityScope[2]}` : 'invalid'] as const
  }, [token])
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [currentSection, setCurrentSection] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [brandLogoUnavailable, setBrandLogoUnavailable] = useState(false)
  const initializedVersion = useRef<string | null>(null)
  const editVersion = useRef(0)

  useLayoutEffect(() => {
    const selectors = [
      'meta[name="theme-color"]',
      'meta[name="application-name"]',
      'meta[name="apple-mobile-web-app-title"]',
      'meta[name="msapplication-TileColor"]',
      'meta[name="title"]',
      'meta[name="description"]',
      'meta[name="keywords"]',
      'meta[name="author"]',
      'meta[name="robots"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
      'link[rel="canonical"]',
      'link[rel="manifest"]',
      'link[rel="icon"]',
      'link[rel="apple-touch-icon"]',
      'script[type="application/ld+json"]',
    ]
    const removed = selectors.flatMap((selector) => [...document.head.querySelectorAll(selector)])
      .filter((node) => !node.hasAttribute('data-rh'))
      .map((node) => ({ node, next: node.nextSibling }))
    removed.forEach(({ node }) => node.remove())
    return () => [...removed].reverse().forEach(({ node, next }) => {
      if (next?.parentNode === document.head) document.head.insertBefore(node, next)
      else document.head.appendChild(node)
    })
  }, [])

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const onboardingQuery = useQuery({
    queryKey: onboardingQueryKey,
    queryFn: () => getClientOnboarding(token, staffPreview),
    enabled: Boolean(token),
    retry: false,
    gcTime: 0,
  })
  const view = onboardingQuery.data

  useEffect(() => setBrandLogoUnavailable(false), [view?.workspace.logo_url])

  useEffect(() => {
    if (!view || !view.definition || view.lock_version === undefined) return
    const version = `${view.id}:${view.lock_version}:${view.status}`
    if (initializedVersion.current === version) return
    setAnswers(view.answers)
    setCurrentSection(Math.min(view.current_section ?? 0, view.definition.sections.length - 1))
    setDirty(false)
    editVersion.current = 0
    initializedVersion.current = version
  }, [view])

  const cacheSavedDraft = (next: ClientOnboardingView, savedEditVersion: number) => {
    queryClient.setQueryData(onboardingQueryKey, next)
    const hasNewerEdits = editVersion.current !== savedEditVersion
    setDirty(hasNewerEdits)
    setSaveState(hasNewerEdits ? 'idle' : 'saved')
    initializedVersion.current = `${next.id}:${next.lock_version}:${next.status}`
  }

  const saveMutation = useMutation({
    mutationFn: ({ nextSection }: { nextSection: number; savedEditVersion: number }) => {
      if (!view || view.lock_version === undefined) throw new Error('Your onboarding is not ready to save.')
      return saveClientOnboarding(token, answers, nextSection, view.lock_version)
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: (next, variables) => cacheSavedDraft(next, variables.savedEditVersion),
    onError: (error) => {
      setSaveState('error')
      setValidationError(error instanceof Error ? error.message : 'Your progress could not be saved.')
    },
  })

  /*
   * A save that failed must not be retried unchanged. The autosave effect
   * used to fire again the moment the failed mutation settled — same
   * answers, same stale lock_version — every 1.2 seconds, forever: an
   * expired link, a revoked instance, or a second tab's conflict turned into
   * an unauthenticated request drumbeat that could never succeed. Typing
   * again re-arms it, because new input is the one thing that changes the
   * outcome; conflicts and closures get their own walls below.
   */
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!view?.definition || view.lock_version === undefined) throw new Error('Your onboarding is not ready to submit.')
      for (let index = 0; index < view.definition.sections.length; index += 1) {
        const error = sectionError(view, answers, index)
        if (error) {
          setCurrentSection(index)
          throw new Error(error)
        }
      }
      let latest = view
      if (dirty) {
        const savedEditVersion = editVersion.current
        latest = await saveClientOnboarding(token, answers, currentSection, view.lock_version)
        cacheSavedDraft(latest, savedEditVersion)
      }
      if (latest.lock_version === undefined) throw new Error('Your saved onboarding could not be submitted.')
      return submitClientOnboarding(token, latest.lock_version)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(onboardingQueryKey, next)
      setDirty(false)
      setValidationError(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (error) => setValidationError(error instanceof Error ? error.message : 'Your onboarding could not be submitted.'),
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ questionId, file }: { questionId: string; file: File }) => {
      if (!view || view.lock_version === undefined) throw new Error('Your onboarding is not ready for uploads.')
      let latest = view
      if (dirty) {
        const savedEditVersion = editVersion.current
        latest = await saveClientOnboarding(token, answers, currentSection, view.lock_version)
        cacheSavedDraft(latest, savedEditVersion)
      }
      if (latest.lock_version === undefined) throw new Error('Save your progress before uploading.')
      return uploadClientOnboardingAsset(token, questionId, file, latest.lock_version)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(onboardingQueryKey, next)
      setAnswers(next.answers)
      setDirty(false)
      setValidationError(null)
      initializedVersion.current = `${next.id}:${next.lock_version}:${next.status}`
    },
    onError: (error) => setValidationError(error instanceof Error ? error.message : 'The file could not be uploaded.'),
  })

  const deleteUploadMutation = useMutation({
    mutationFn: async ({ assetId }: { assetId: string }) => {
      if (!view || view.lock_version === undefined) throw new Error('Your onboarding is not ready.')
      let latest = view
      if (dirty) {
        const savedEditVersion = editVersion.current
        latest = await saveClientOnboarding(token, answers, currentSection, view.lock_version)
        cacheSavedDraft(latest, savedEditVersion)
      }
      if (latest.lock_version === undefined) throw new Error('Save your progress before removing the file.')
      return deleteClientOnboardingAsset(token, assetId, latest.lock_version)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(onboardingQueryKey, next)
      setAnswers(next.answers)
      setDirty(false)
      initializedVersion.current = `${next.id}:${next.lock_version}:${next.status}`
    },
    onError: (error) => setValidationError(error instanceof Error ? error.message : 'The file could not be removed.'),
  })

  useEffect(() => {
    if (
      !dirty
      || saveState === 'error'
      || saveMutation.isPending
      || submitMutation.isPending
      || uploadMutation.isPending
      || deleteUploadMutation.isPending
      || !view?.definition
      || view.lock_version === undefined
    ) return
    const timeout = window.setTimeout(() => saveMutation.mutate({
      nextSection: currentSection,
      savedEditVersion: editVersion.current,
    }), 1200)
    return () => window.clearTimeout(timeout)
  }, [answers, currentSection, deleteUploadMutation.isPending, dirty, saveMutation, saveState, submitMutation.isPending, uploadMutation.isPending, view?.definition, view?.lock_version])

  useEffect(() => {
    if (!dirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [dirty])

  const questionSection = useMemo(() => {
    const result = new Map<string, number>()
    view?.definition?.sections.forEach((section, sectionIndex) => {
      section.questions.forEach((question) => result.set(question.id, sectionIndex))
    })
    return result
  }, [view?.definition])

  const setAnswer = (questionId: string, value: unknown) => {
    editVersion.current += 1
    setAnswers((current) => ({ ...current, [questionId]: value }))
    setDirty(true)
    setSaveState('idle')
    setValidationError(null)
  }

  const goNext = async () => {
    if (!view?.definition) return
    const error = sectionError(view, answers, currentSection)
    if (error) {
      setValidationError(error)
      return
    }
    const next = Math.min(currentSection + 1, view.definition.sections.length - 1)
    setValidationError(null)
    try {
      /*
       * No setAnswers from the server echo here: it reflects what was sent
       * BEFORE the round trip, and overwriting with it silently discarded
       * anything typed while the save was in flight. cacheSavedDraft (via
       * onSuccess) already reconciles with the editVersion guard, exactly as
       * the autosave path does.
       */
      await saveMutation.mutateAsync({
        nextSection: next,
        savedEditVersion: editVersion.current,
      })
    } catch {
      return
    }
    setCurrentSection(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (onboardingQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-slate-700" /><p className="mt-3 text-sm text-slate-600">Opening your secure onboarding…</p></div></div>
  }

  if (onboardingQuery.error || !view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f4ff] p-4">
        <Card className="w-full max-w-lg text-center"><CardHeader><div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-red-50"><LockKeyhole className="h-7 w-7 text-red-600" /></div><CardTitle>Onboarding link unavailable</CardTitle><CardDescription>{onboardingQuery.error instanceof Error ? onboardingQuery.error.message : 'Contact the person who sent you this secure link.'}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void onboardingQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
      </div>
    )
  }

  const accent = onboardingAccentColor(view.accent_color)
  const brandStyle = {
    '--primary': onboardingAccentHsl(accent),
    '--ring': onboardingAccentHsl(accent),
    '--primary-foreground': '0 0% 100%',
    '--onboarding-accent': accent,
  } as CSSProperties
  const workspaceName = view.workspace.name
  const terminal = ['submitted', 'approved', 'expired', 'revoked'].includes(view.status)
  if (terminal) {
    const content = view.status === 'submitted'
      ? { title: 'Onboarding submitted', body: renderOnboardingBrandText(view.completion_message || `Your answers are now with ${workspaceName} for review.`, workspaceName), icon: <CheckCircle2 className="h-9 w-9 text-emerald-600" /> }
      : view.status === 'approved'
        ? { title: 'Your profile is approved', body: `${workspaceName} finalized your podcast guest profile. No further action is needed here.`, icon: <CheckCircle2 className="h-9 w-9 text-emerald-600" /> }
        : view.status === 'expired'
          ? { title: 'This secure link has expired', body: `Your saved draft is retained. Contact ${workspaceName} for a new link so you can continue.`, icon: <Clock3 className="h-9 w-9 text-amber-600" /> }
          : { title: 'This secure link was revoked', body: `Contact ${workspaceName} if you still need to complete onboarding.`, icon: <LockKeyhole className="h-9 w-9 text-red-600" /> }
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10" style={brandStyle}>
        <ClientBrandHead view={view} logoUnavailable={brandLogoUnavailable} />
        <div className="mx-auto max-w-2xl">
          <BrandHeader workspace={view.workspace} accent={accent} logoUnavailable={brandLogoUnavailable} onLogoError={() => setBrandLogoUnavailable(true)} />
          <Card className="mt-6 border-0 text-center shadow-xl shadow-slate-900/10"><CardHeader className="p-8"><div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">{content.icon}</div><CardTitle className="text-2xl">{content.title}</CardTitle><CardDescription className="mx-auto max-w-lg text-base leading-7">{content.body}</CardDescription></CardHeader></Card>
        </div>
      </div>
    )
  }

  if (!view.definition || view.lock_version === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4" style={brandStyle}><ClientBrandHead view={view} logoUnavailable={brandLogoUnavailable} /><Card><CardHeader><CardTitle>Onboarding unavailable</CardTitle><CardDescription>The form could not be loaded. Contact {workspaceName} for help.</CardDescription></CardHeader></Card></div>
  }

  const section = view.definition.sections[currentSection]
  const progress = ((currentSection + 1) / view.definition.sections.length) * 100
  const activeComments = view.comments ?? []
  const expiresAt = new Date(view.expires_at)
  const expiryLabel = Number.isFinite(expiresAt.valueOf())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(expiresAt)
    : null

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.10),transparent_34%),linear-gradient(to_bottom,#f8fafc,#f1f5f9)] pb-14" style={brandStyle}>
      <ClientBrandHead view={view} logoUnavailable={brandLogoUnavailable} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <BrandHeader workspace={view.workspace} accent={accent} logoUnavailable={brandLogoUnavailable} onLogoError={() => setBrandLogoUnavailable(true)} />

        <Card className="mt-6 overflow-hidden border-0 shadow-2xl shadow-slate-900/10">
          <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}99, ${accent}55)` }} />
          <CardHeader className="space-y-4 p-5 sm:p-8">
            <div><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">Private client intake</Badge>{view.recipient_name && <p className="mb-1 text-sm font-medium text-slate-500">Hi {view.recipient_name},</p>}<CardTitle className="text-2xl sm:text-3xl">{renderOnboardingBrandText(view.definition.intro_title, workspaceName)}</CardTitle><CardDescription className="mt-2 max-w-2xl text-base leading-7">{renderOnboardingBrandText(view.definition.intro_body, workspaceName)}</CardDescription></div>
            <div className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="font-medium">Section {currentSection + 1} of {view.definition.sections.length}</span><span className="text-slate-500">{Math.round(progress)}% · {section.questions.length} {section.questions.length === 1 ? 'question' : 'questions'}</span></div><Progress value={progress} className="h-2" /></div>
            <div className="flex items-start gap-2 text-xs leading-5 text-slate-500"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Your progress saves automatically and stays private with {workspaceName}.{expiryLabel ? ` You can return with this link through ${expiryLabel}.` : ''}</span></div>
          </CardHeader>

          <CardContent className="space-y-6 border-t bg-white p-5 sm:p-8">
            {activeComments.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50"><MessageSquareMore className="h-4 w-4 text-amber-700" /><AlertTitle>Updates requested</AlertTitle><AlertDescription><p className="mb-3">{workspaceName} left notes on these questions. Update each answer, then resubmit.</p><div className="space-y-2">{activeComments.map((comment) => <button key={comment.id} type="button" className="block w-full rounded-lg border border-amber-200 bg-white p-3 text-left text-sm hover:border-amber-400" onClick={() => setCurrentSection(questionSection.get(comment.question_id) ?? 0)}><span className="font-semibold">{renderOnboardingBrandText(view.definition?.sections.flatMap((item) => item.questions).find((question) => question.id === comment.question_id)?.label ?? '', workspaceName)}</span><span className="mt-1 block text-amber-900">{comment.body}</span></button>)}</div></AlertDescription></Alert>
            )}

            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Section {currentSection + 1}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{renderOnboardingBrandText(section.title, workspaceName)}</h2>{section.description && <p className="mt-2 text-slate-600">{renderOnboardingBrandText(section.description, workspaceName)}</p>}</div>

            <div className="space-y-7">{section.questions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                workspaceName={workspaceName}
                answer={answers[question.id]}
                asset={view.assets.find((candidate) => candidate.question_id === question.id)}
                disabled={submitMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending}
                onChange={(value) => setAnswer(question.id, value)}
                onUpload={(file) => uploadMutation.mutate({ questionId: question.id, file })}
                onDeleteUpload={(assetId) => deleteUploadMutation.mutate({ assetId })}
              />
            ))}</div>

            {validationError && <Alert variant="destructive"><AlertTitle>Please check this section</AlertTitle><AlertDescription>{validationError}</AlertDescription></Alert>}

            <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" disabled={currentSection === 0 || saveMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending || submitMutation.isPending} onClick={() => { editVersion.current += 1; setCurrentSection((value) => Math.max(0, value - 1)); setDirty(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <span aria-live="polite" className={`inline-flex items-center justify-center gap-1.5 text-xs ${saveState === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{saveMutation.isPending || saveState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveState === 'saved' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5" />}{saveMutation.isPending || saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Save failed' : dirty ? 'Saving shortly…' : 'All changes saved'}</span>
                {/* The two ways out of a failed save, offered where the failure
                    is announced. Retry re-sends as-is; refresh re-reads the
                    form — which is the only fix when another tab moved it or
                    the link closed, and used to require knowing to reload the
                    browser through a warning about unsaved changes. */}
                {saveState === 'error' && (
                  <span className="inline-flex items-center gap-2 text-xs">
                    <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => { setSaveState('idle') }}>Try again</button>
                    <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => { setSaveState('idle'); setDirty(false); void onboardingQuery.refetch() }}>Refresh the form</button>
                  </span>
                )}
                {currentSection < view.definition.sections.length - 1 ? <Button disabled={saveMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending || submitMutation.isPending} onClick={() => void goNext()}>Save & continue<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button disabled={saveMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending || submitMutation.isPending} onClick={() => submitMutation.mutate()}>{submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Submit for review</Button>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const BrandHeader = ({ workspace, accent, logoUnavailable, onLogoError }: { workspace: ClientOnboardingView['workspace']; accent: string; logoUnavailable: boolean; onLogoError: () => void }) => (
  <header className="relative overflow-hidden rounded-2xl p-4 text-white shadow-xl shadow-slate-950/20 sm:p-5" style={{ background: `linear-gradient(135deg, #111827 0%, ${accent} 100%)` }}>
    <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
      {workspace.logo_url && !logoUnavailable ? <div className="relative flex h-20 w-full max-w-56 items-center justify-center rounded-xl border border-white/30 bg-white p-3 shadow-lg sm:h-16 sm:w-52"><img src={workspace.logo_url} alt={`${workspace.name} logo`} className="max-h-full max-w-full object-contain" onError={onLogoError} /></div> : <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-white/15 text-lg font-black ring-1 ring-white/25">{onboardingWorkspaceInitials(workspace.name)}</div>}
      <div className="relative min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/70">Client onboarding</p><h1 className="mt-0.5 truncate text-xl font-bold sm:text-2xl">{workspace.name}</h1><p className="mt-0.5 text-xs text-white/80">Secure client intake</p></div>
    </div>
  </header>
)

interface QuestionFieldProps {
  question: OnboardingQuestion
  workspaceName: string
  answer: unknown
  asset: ClientOnboardingView['assets'][number] | undefined
  disabled: boolean
  onChange: (value: unknown) => void
  onUpload: (file: File) => void
  onDeleteUpload: (assetId: string) => void
}

const QuestionField = ({ question, workspaceName, answer, asset, disabled, onChange, onUpload, onDeleteUpload }: QuestionFieldProps) => {
  const inputId = `onboarding-${question.id}`
  const fileInput = useRef<HTMLInputElement>(null)
  const label = <Label htmlFor={inputId} className="text-base font-semibold text-slate-900">{renderOnboardingBrandText(question.label, workspaceName)}{question.required && <span className="text-red-500"> *</span>}</Label>
  const help = question.description && <p className="text-sm leading-6 text-slate-500">{renderOnboardingBrandText(question.description, workspaceName)}</p>
  const placeholder = renderOnboardingBrandText(question.placeholder, workspaceName)

  if (question.type === 'long_text') return <div className="space-y-2">{label}{help}<Textarea id={inputId} rows={5} maxLength={20000} disabled={disabled} value={typeof answer === 'string' ? answer : ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>
  if (question.type === 'yes_no') return <div className="space-y-3">{label}{help}<RadioGroup disabled={disabled} value={typeof answer === 'boolean' ? String(answer) : ''} onValueChange={(value) => onChange(value === 'true')} className="flex gap-5"><label className="flex items-center gap-2"><RadioGroupItem value="true" />Yes</label><label className="flex items-center gap-2"><RadioGroupItem value="false" />No</label></RadioGroup></div>
  if (question.type === 'single_select') return <div className="space-y-2">{label}{help}<Select disabled={disabled} value={typeof answer === 'string' ? answer : ''} onValueChange={onChange}><SelectTrigger id={inputId}><SelectValue placeholder="Choose an option" /></SelectTrigger><SelectContent>{question.options?.map((option) => <SelectItem key={option.id} value={option.id}>{renderOnboardingBrandText(option.label, workspaceName)}</SelectItem>)}</SelectContent></Select></div>
  if (question.type === 'multi_select') {
    const selected = Array.isArray(answer) ? answer.filter((value): value is string => typeof value === 'string') : []
    return <div className="space-y-3">{label}{help}<div className="grid gap-2 sm:grid-cols-2">{question.options?.map((option) => <label key={option.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm transition hover:border-primary/40 hover:bg-primary/5"><Checkbox disabled={disabled} checked={selected.includes(option.id)} onCheckedChange={(checked) => onChange(checked === true ? [...selected, option.id] : selected.filter((value) => value !== option.id))} />{renderOnboardingBrandText(option.label, workspaceName)}</label>)}</div></div>
  }
  if (question.type === 'image_upload' || question.type === 'document_upload') {
    const accept = question.type === 'image_upload' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'
    return <div className="space-y-2">{label}{help}{asset ? <div className="flex flex-col gap-3 rounded-xl border bg-slate-50 p-4 sm:flex-row sm:items-center"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white">{question.type === 'image_upload' ? <ImageIcon className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}</div><div className="min-w-0 flex-1">{asset.signed_url ? <a className="block truncate text-sm font-semibold text-primary hover:underline" href={asset.signed_url} target="_blank" rel="noreferrer">{asset.original_name}</a> : <p className="truncate text-sm font-semibold text-slate-600">{asset.original_name} · preview unavailable</p>}<p className="text-xs text-slate-500">{(asset.byte_size / 1_048_576).toFixed(1)} MB</p></div><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onDeleteUpload(asset.id)}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div> : <button type="button" disabled={disabled} className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/25 bg-primary/5 p-5 text-center transition hover:border-primary/60 disabled:opacity-60" onClick={() => fileInput.current?.click()}><UploadCloud className="h-7 w-7 text-primary" /><span className="mt-2 text-sm font-semibold text-primary">Choose {question.type === 'image_upload' ? 'an image' : 'a PDF'}</span><span className="mt-1 text-xs text-slate-500">{question.type === 'image_upload' ? 'PNG, JPEG, or WebP up to 5 MB' : 'PDF up to 10 MB'}</span></button>}<input ref={fileInput} id={inputId} type="file" accept={accept} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = '' }} /></div>
  }
  if (question.type === 'date') {
    return <div className="space-y-2">{label}{help}<Input id={inputId} disabled={disabled} type="date" placeholder={placeholder} value={typeof answer === 'string' ? answer : ''} onChange={(event) => onChange(event.target.value)} /></div>
  }
  // email/url get the right mobile keyboard and light client validation; the
  // generic text box was giving a non-technical client a plain keyboard and no
  // format hint on a form built for outside people. Server validation stays
  // free-form, so this is help, not a gate.
  const inputType = question.type === 'email' ? 'email' : question.type === 'url' ? 'url' : 'text'
  const inputMode = question.type === 'email' ? 'email' : question.type === 'url' ? 'url' : undefined
  return <div className="space-y-2">{label}{help}<Input id={inputId} disabled={disabled} type={inputType} inputMode={inputMode} maxLength={question.type === 'url' ? 2048 : 500} value={typeof answer === 'string' ? answer : ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>
}

const ClientOnboardingPage = () => (
  <>
    <PageSEO
      title="Secure client onboarding"
      description="Private and secure client onboarding."
      path="/onboarding"
      noindex
      whiteLabel
      brandName="Client onboarding"
    />
    <ClientOnboarding />
  </>
)

export default ClientOnboardingPage
