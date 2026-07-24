import { useState } from 'react'
import {
  Inbox,
  Megaphone,
  MessageSquare,
  Mic2,
  Radio,
  Search,
  Send,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type InboxScope = 'all' | 'interested' | 'other'
type InboxFilter = 'all' | 'attention' | 'needs-reply' | 'review' | 'sent' | 'ai' | 'booked' | 'ended'

const inboxFilters: Array<{ value: InboxFilter; label: string; title: string }> = [
  { value: 'all', label: 'All', title: 'Show every conversation in this reply scope' },
  { value: 'attention', label: 'Attention', title: 'Replies and issues that need immediate attention' },
  { value: 'needs-reply', label: 'Needs reply', title: 'The host sent the newest message' },
  { value: 'review', label: 'Review', title: 'A response draft is ready to review' },
  { value: 'sent', label: 'Replied', title: 'The workspace has replied' },
  { value: 'ai', label: 'AI', title: 'Conversations currently handled by AI' },
  { value: 'booked', label: 'Booked', title: 'Conversations with a confirmed podcast booking' },
  { value: 'ended', label: 'Ended', title: 'Conversations that are no longer active' },
]

const interestedWorkflowFilters: InboxFilter[] = ['attention', 'needs-reply', 'review', 'sent']

const contextItems = [
  { title: 'Client', detail: 'Every reply is assigned to the client who owns the outreach.', icon: UserRound },
  { title: 'Client campaign', detail: 'The mapped campaign identifies exactly where the conversation belongs.', icon: Megaphone },
  { title: 'Podcast and contact', detail: 'Keep the show, host, and verified recipient beside the thread.', icon: Mic2 },
  { title: 'Reply status', detail: 'Know whether the conversation needs a response, review, or no action.', icon: MessageSquare },
]

const MasterInboxPreview = () => {
  const [scope, setScope] = useState<InboxScope>('all')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')

  return (
    <Card className="overflow-hidden shadow-none">
      <div className="border-b bg-background">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Inbox scope" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'all'}
                onClick={() => setScope('all')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                All replies <span className="ml-1 text-muted-foreground">0</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'interested'}
                onClick={() => setScope('interested')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'interested' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Interested <span className="ml-1 text-muted-foreground">0</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'other'}
                onClick={() => {
                  setScope('other')
                  if (interestedWorkflowFilters.includes(filter)) setFilter('all')
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'other' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Other replies <span className="ml-1 text-muted-foreground">0</span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search conversations"
                placeholder="Search conversations"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <Badge variant="outline" className="w-fit gap-2 text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            Automatic sync on connection
          </Badge>
        </div>

        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto border-t bg-muted/10 px-3 py-2 lg:px-4" aria-label="Conversation filters">
          <Select defaultValue="all-clients">
            <SelectTrigger aria-label="Filter by client" className="h-7 w-36 shrink-0 gap-1.5 bg-background px-2.5 text-xs">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-clients">All clients</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all-campaigns">
            <SelectTrigger aria-label="Filter by client campaign" className="h-7 w-40 shrink-0 gap-1.5 bg-background px-2.5 text-xs">
              <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-campaigns">All campaigns</SelectItem>
            </SelectContent>
          </Select>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          {scope === 'other' && (
            <span className="mr-1 shrink-0 self-center text-[11px] text-muted-foreground">
              Workflow stages apply to interested replies.
            </span>
          )}
          {inboxFilters
            .filter((item) => scope !== 'other' || !interestedWorkflowFilters.includes(item.value))
            .map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                title={item.title}
                onClick={() => setFilter(item.value)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === item.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label} <span className="ml-1 opacity-70">0</span>
              </button>
            ))}
        </div>
      </div>

      <div className="grid min-h-[620px] md:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_18rem]">
        <aside className="flex min-h-0 flex-col border-r bg-muted/10">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Conversations</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Client and campaign shown on every reply</p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">0</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-muted-foreground">
              <Inbox className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">{search.trim() ? 'No matching conversations' : 'No conversations yet'}</h3>
            <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
              {search.trim() ? 'Try another name, podcast, client, or campaign.' : 'Replies from mapped client campaigns will appear here automatically.'}
            </p>
          </div>
        </aside>

        <section className="hidden min-w-0 flex-col bg-background md:flex">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">Conversation thread</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Select a reply to open its complete history.</p>
            </div>
            <Badge variant="outline" className="text-muted-foreground">No conversation selected</Badge>
          </div>

          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-xl text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquare className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-lg font-semibold">Open a conversation to see the full thread</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                The original pitch, every host reply, and every workspace response stay together in chronological order.
              </p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
                {[
                  ['1', 'Original outreach'],
                  ['2', 'Host reply'],
                  ['3', 'Workspace response'],
                ].map(([step, label]) => (
                  <div key={step} className="rounded-xl border bg-muted/15 p-3">
                    <span className="text-xs font-semibold text-primary">{step}</span>
                    <p className="mt-1 text-xs font-medium">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t bg-muted/10 p-3">
            <div className="flex items-center justify-between rounded-lg border border-dashed bg-background px-4 py-3 text-xs text-muted-foreground">
              <span>Reply composer appears when a conversation is selected.</span>
              <Send className="h-4 w-4" />
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col border-l bg-muted/10 xl:flex">
          <div className="border-b px-4 py-3.5">
            <h2 className="text-sm font-semibold">Conversation context</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Everything needed to respond.</p>
          </div>
          <div className="flex-1 divide-y">
            {contextItems.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="p-4">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="border-t p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Radio className="h-3.5 w-3.5" />
              Context loads with the selected reply
            </div>
          </div>
        </aside>
      </div>
    </Card>
  )
}

export default MasterInboxPreview
