import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, MessageSquareWarning } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { onboardingStatusLabel } from '@/lib/onboardingActivity'
import type { OnboardingInstanceDetail, OnboardingQuestion } from '@/services/workspaceOnboarding'

export interface OnboardingReviewComment {
  question_id: string
  body: string
}

interface Props {
  open: boolean
  detail: OnboardingInstanceDetail | null
  canManage: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onApprove: () => void
  onRequestChanges: (comments: OnboardingReviewComment[]) => void
}

function emptyAnswer(answer: unknown): boolean {
  return answer === undefined
    || answer === null
    || answer === ''
    || (Array.isArray(answer) && answer.length === 0)
}

function displayAnswer(question: OnboardingQuestion, answer: unknown): string {
  if (emptyAnswer(answer)) return 'Not answered'
  if (question.type === 'yes_no') return answer === true ? 'Yes' : 'No'
  if (question.type === 'single_select' && typeof answer === 'string') {
    return question.options?.find((option) => option.id === answer)?.label ?? answer
  }
  if (question.type === 'multi_select' && Array.isArray(answer)) {
    return answer.map((entry) => question.options?.find((option) => option.id === entry)?.label ?? String(entry)).join(', ')
  }
  if (question.type === 'image_upload' || question.type === 'document_upload') return 'Uploaded file'
  return String(answer)
}

const OnboardingReviewDialog = ({ open, detail, canManage, busy, onOpenChange, onApprove, onRequestChanges }: Props) => {
  const assetByQuestion = useMemo(
    () => new Map(detail?.assets.map((asset) => [asset.question_id, asset]) ?? []),
    [detail?.assets],
  )
  const [reviewing, setReviewing] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})

  // Notes belong to the submission that was open, never to the next one.
  // Keyed on the instance as well as the dialog: templates are reused, so the
  // question ids match across clients, and a note left behind would reappear
  // pre-filled under somebody else's answer.
  const detailId = detail?.id ?? null
  useEffect(() => {
    setReviewing(false)
    setNotes({})
  }, [open, detailId])

  const comments = Object.entries(notes)
    .map(([question_id, body]) => ({ question_id, body: body.trim() }))
    .filter((comment) => comment.body.length > 0 && comment.body.length <= 2000)

  if (!detail) return null

  const questions = detail.definition.sections.flatMap((section) => section.questions)
  const answeredCount = questions.filter((question) => !emptyAnswer(detail.answers[question.id])).length
  const submittedLabel = detail.submitted_at
    ? new Date(detail.submitted_at).toLocaleString()
    : 'Not submitted yet'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader className="border-b pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{detail.client_name}</DialogTitle>
            <Badge>{onboardingStatusLabel(detail.status)}</Badge>
            <Badge variant="outline">Revision {detail.current_revision}</Badge>
          </div>
          <DialogDescription>
            {detail.template_name} v{detail.template_version} · Submitted {submittedLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Submitted answers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {reviewing
                ? 'Write a note under each answer you want redone. Only the answers you note are sent back.'
                : 'The client’s completed form, shown exactly as submitted.'}
            </p>
          </div>
          <Badge variant="secondary">{answeredCount} of {questions.length} answered</Badge>
        </div>

        {reviewing && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            Sending these notes emails {detail.recipient_name} and reopens their onboarding link so they can edit and
            resubmit. Their current answers are kept as a revision.
          </p>
        )}

        <div className="space-y-5">
          {detail.definition.sections.map((section) => (
            <section key={section.id} className="rounded-2xl border bg-card p-5 sm:p-6">
              <h3 className="text-lg font-semibold">{section.title}</h3>
              {section.description && <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>}
              <dl className="mt-5 grid gap-3">
                {section.questions.map((question) => {
                  const answer = detail.answers[question.id]
                  const asset = assetByQuestion.get(question.id)
                  const unanswered = emptyAnswer(answer)
                  return (
                    <div key={question.id} className="rounded-xl border bg-muted/20 px-4 py-4 sm:px-5">
                      <dt className="text-sm font-semibold text-foreground">{question.label}</dt>
                      <dd className={unanswered ? 'mt-2 text-sm italic text-muted-foreground' : 'mt-2 whitespace-pre-wrap text-base leading-7 text-foreground'}>
                        {asset ? asset.signed_url ? (
                          <a className="inline-flex items-center gap-2 font-medium text-primary hover:underline" href={asset.signed_url} target="_blank" rel="noreferrer">
                            {asset.original_name}<ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{asset.original_name} · preview unavailable</span>
                        ) : displayAnswer(question, answer)}
                      </dd>
                      {reviewing && (
                        <Textarea
                          className="mt-3 bg-background"
                          rows={2}
                          maxLength={2000}
                          placeholder="What needs changing? Leave empty to accept this answer."
                          aria-label={`Change requested for ${question.label}`}
                          value={notes[question.id] ?? ''}
                          onChange={(event) => setNotes((current) => ({ ...current, [question.id]: event.target.value }))}
                        />
                      )}
                    </div>
                  )
                })}
              </dl>
            </section>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 border-t pt-5 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => (reviewing ? setReviewing(false) : onOpenChange(false))}>
            {reviewing ? 'Cancel' : 'Close'}
          </Button>
          {canManage && detail.status === 'submitted' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {reviewing ? (
                <Button type="button" variant="destructive" disabled={busy || comments.length === 0} onClick={() => onRequestChanges(comments)}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareWarning className="mr-2 h-4 w-4" />}
                  {comments.length === 0
                    ? 'Note at least one answer'
                    : `Send ${comments.length} change${comments.length === 1 ? '' : 's'} back`}
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled={busy} onClick={() => setReviewing(true)}>
                  <MessageSquareWarning className="mr-2 h-4 w-4" />Request changes
                </Button>
              )}
              <Button type="button" disabled={busy || reviewing} onClick={onApprove}>
                {busy && !reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Approve onboarding
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingReviewDialog
