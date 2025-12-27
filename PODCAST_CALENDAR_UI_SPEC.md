# Podcast Calendar System - UI Specification

## Component Architecture

### Navigation Structure
Add to existing `DashboardLayout.tsx` navigation:
```typescript
const defaultNavItems: NavItem[] = [
  // ... existing items
  { id: 'calendar', name: 'Podcast Calendar', href: '/admin/calendar', icon: Calendar },
  { id: 'clients', name: 'Clients', href: '/admin/clients', icon: Users },
  { id: 'podcast-database', name: 'Podcast Database', href: '/admin/podcast-database', icon: Mic },
]
```

---

## Page 1: Calendar Dashboard (`/admin/calendar`)

### Purpose
Main calendar view showing all clients and their monthly bookings in a grid format.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ Podcast Calendar                                               │
│ Track all client bookings across months                        │
├────────────────────────────────────────────────────────────────┤
│ [Stats Cards Row]                                              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ │ Active   │ │ This     │ │ Next     │ │ This     │         │
│ │ Clients  │ │ Month    │ │ Week     │ │ Year     │         │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
├────────────────────────────────────────────────────────────────┤
│ Year: [2025 ▼]  Search: [__________]                         │
├────────────────────────────────────────────────────────────────┤
│ Monthly Grid Calendar                                          │
│ ┌─────────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐    │
│ │ Client  │Jan │Feb │Mar │Apr │May │Jun │Jul │Aug │Sep │... │
│ ├─────────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤    │
│ │ Client A│ 3  │ 2  │ 4  │ 1  │ 3  │ 2  │ 0  │ 1  │ 2  │    │
│ │ Client B│ 1  │ 1  │ 2  │ 2  │ 1  │ 3  │ 1  │ 0  │ 1  │    │
│ └─────────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘    │
└────────────────────────────────────────────────────────────────┘
```

### Components

#### Stats Cards (4 cards)
```typescript
<Card>
  <CardHeader>
    <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
    <Users className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{activeClientsCount}</div>
    <p className="text-xs text-muted-foreground">Currently servicing</p>
  </CardContent>
</Card>
```

Stats to display:
1. **Active Clients** - Count of clients with status='active'
2. **This Month** - Total bookings scheduled this month
3. **Next Week** - Upcoming recordings in next 7 days
4. **This Year** - Total bookings for current year

#### Calendar Grid
- Table component with:
  - Row header: Client name (clickable to client detail page)
  - Column headers: Month names (Jan-Dec)
  - Cells: Number of bookings (clickable to see booking list modal)
  - Color coding:
    - Green text: Has bookings
    - Gray text: No bookings
    - Bold: Current month
  - Hover effect showing status breakdown (scheduled/recorded/published)

#### Filters & Controls
- Year selector dropdown (2024, 2025, 2026...)
- Search input (filter clients by name)
- View toggle: Grid / Timeline (Phase 2)

### Data Fetching
```typescript
// React Query hook
const { data: calendarData } = useQuery({
  queryKey: ['calendar', year, searchTerm],
  queryFn: () => getCalendarData(year, searchTerm)
})

// Service function
async function getCalendarData(year: number, search?: string) {
  // Query the client_monthly_bookings view
  // Filter by year and search term
  // Return structure:
  // {
  //   clients: [{ id, name, monthlyBookings: {...} }],
  //   stats: { activeClients, thisMonth, nextWeek, thisYear }
  // }
}
```

---

## Page 2: Clients Management (`/admin/clients`)

### Purpose
Manage all clients - view list, add new, edit, view booking history.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ Clients                                                         │
│ Manage your podcast placement clients                          │
├────────────────────────────────────────────────────────────────┤
│ [Stats Cards]                                                   │
│ Active: 12  Paused: 2  Churned: 3  Avg Bookings/Month: 2.5   │
├────────────────────────────────────────────────────────────────┤
│ [Search]  [Filter: All ▼]  [+ Add Client]                     │
├────────────────────────────────────────────────────────────────┤
│ ┌─────────┬──────────┬────────┬──────────┬──────────┬──────┐ │
│ │ Name    │ Email    │ Status │ Bookings │ Last     │Actions││
│ ├─────────┼──────────┼────────┼──────────┼──────────┼──────┤ │
│ │ Client A│ a@co.com │Active  │ 24       │ 2 days   │ View │ │
│ │ Client B│ b@co.com │Active  │ 18       │ 1 week   │ View │ │
│ └─────────┴──────────┴────────┴──────────┴──────────┴──────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Components

#### Client List Table
Columns:
- **Name** - Client name (clickable to detail view)
- **Email** - Contact email
- **Status** - Badge (green: active, yellow: paused, red: churned)
- **Total Bookings** - Count of all bookings
- **Last Booking** - Relative time (e.g., "2 days ago")
- **Actions** - View | Edit | Add Booking buttons

#### Add/Edit Client Form (Modal or Side Panel)
```typescript
interface ClientForm {
  name: string           // Required
  email: string
  linkedin_url: string
  website: string
  calendar_link: string
  contact_person: string
  first_invoice_paid_date: Date | null
  status: 'active' | 'paused' | 'churned'
  notes: string
}

<Dialog>
  <DialogHeader>
    <DialogTitle>Add New Client</DialogTitle>
  </DialogHeader>
  <DialogContent>
    <Form>
      <FormField name="name" label="Client Name *" />
      <FormField name="email" label="Email" type="email" />
      <FormField name="contact_person" label="Contact Person" />
      <FormField name="linkedin_url" label="LinkedIn URL" />
      <FormField name="website" label="Website" />
      <FormField name="calendar_link" label="Calendar Link" />
      <FormField name="first_invoice_paid_date" label="First Payment Date" type="date" />
      <FormField name="status" label="Status" type="select">
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="churned">Churned</option>
      </FormField>
      <FormField name="notes" label="Notes" type="textarea" />
      <Button type="submit">Save Client</Button>
    </Form>
  </DialogContent>
</Dialog>
```

---

## Page 3: Client Detail View (`/admin/clients/:id`)

### Purpose
Detailed view of a single client with all their bookings and calendar.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to Clients                                              │
│                                                                 │
│ Client Name                                    [Edit] [Delete]  │
│ Active • Joined Jan 2024                                       │
├────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────────────────────────────┐│
│ │ Client Info     │ │ Quick Stats                             ││
│ │                 │ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ││
│ │ Email:          │ │ │ Total    │ │ This     │ │ This     │ ││
│ │ Contact:        │ │ │ Bookings │ │ Month    │ │ Year     │ ││
│ │ LinkedIn:       │ │ │   24     │ │    2     │ │   18     │ ││
│ │ Calendar:       │ │ └──────────┘ └──────────┘ └──────────┘ ││
│ │ Website:        │ │                                         ││
│ └─────────────────┘ └─────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────────┤
│ Bookings                                      [+ Add Booking]   │
│ ┌──────────────┬────────────┬────────┬──────────────┬──────┐  │
│ │ Podcast      │ Scheduled  │ Status │ Episode URL  │Actions││
│ ├──────────────┼────────────┼────────┼──────────────┼──────┤  │
│ │ Podcast A    │ 2024-01-15 │Published│ [Link]      │ Edit │  │
│ │ Podcast B    │ 2024-01-22 │Recorded│    -         │ Edit │  │
│ └──────────────┴────────────┴────────┴──────────────┴──────┘  │
├────────────────────────────────────────────────────────────────┤
│ Notes                                                [Edit]     │
│ Special instructions or notes about this client...             │
└────────────────────────────────────────────────────────────────┘
```

### Components

#### Client Info Card
Display all client fields with external link icons for URLs.

#### Quick Stats Cards
- Total Bookings (all time)
- This Month (scheduled + recorded + published)
- This Year (year-to-date bookings)

#### Bookings Table
Columns:
- **Podcast Name** - With link to podcast detail
- **Scheduled Date** - Date picker (editable inline)
- **Status** - Badge with color coding
- **Recording Date** - If status is recorded/published
- **Episode URL** - Link icon if available
- **Actions** - Edit | Delete dropdown

Filters:
- Status filter dropdown
- Date range picker
- Sort by date (asc/desc)

#### Add Booking Modal
```typescript
interface BookingForm {
  podcast_id: string      // Searchable dropdown
  scheduled_date: Date
  status: 'scheduled' | 'recorded' | 'published' | 'cancelled'
  recording_date?: Date
  publish_date?: Date
  episode_url?: string
  notes?: string
  prep_sent: boolean
}

<Dialog>
  <DialogHeader>
    <DialogTitle>Add Booking for {clientName}</DialogTitle>
  </DialogHeader>
  <DialogContent>
    <Form>
      <FormField
        name="podcast_id"
        label="Select Podcast *"
        type="combobox"
        placeholder="Search podcasts..."
      />
      <div className="flex gap-4">
        <FormField name="scheduled_date" label="Scheduled Date" type="date" />
        <FormField name="status" label="Status" type="select" />
      </div>
      <FormField name="recording_date" label="Recording Date" type="date" />
      <FormField name="publish_date" label="Publish Date" type="date" />
      <FormField name="episode_url" label="Episode URL" type="url" />
      <FormField name="prep_sent" label="Prep Materials Sent" type="checkbox" />
      <FormField name="notes" label="Notes" type="textarea" />
      <Button type="submit">Add Booking</Button>
    </Form>
  </DialogContent>
</Dialog>
```

---

## Page 4: Podcast Database (`/admin/podcast-database`)

### Purpose
Master list of all podcasts used across all clients.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ Podcast Database                                               │
│ Master list of all podcasts                                    │
├────────────────────────────────────────────────────────────────┤
│ [Stats Cards]                                                   │
│ Total: 143  Used: 89  Avg Rating: 4.2                         │
├────────────────────────────────────────────────────────────────┤
│ [Search]  [Category: All ▼]  [Rating: All ▼]  [+ Add Podcast] │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────┬───────────┬────────┬──────┬────────┬──────────┐  │
│ │ Name     │ Host      │Category│Rating│Audience│Times Used││
│ ├──────────┼───────────┼────────┼──────┼────────┼──────────┤  │
│ │ Podcast A│ John Doe  │Business│ 4.5  │ 50K    │   12     │  │
│ │ Podcast B│ Jane Smith│Tech    │ 4.8  │ 100K   │   8      │  │
│ └──────────┴───────────┴────────┴──────┴────────┴──────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Components

#### Podcast List Table
Columns:
- **Name** - Clickable to detail view
- **Host Name**
- **Category** - Badge
- **Rating** - Star display (e.g., ⭐ 4.5)
- **Audience Size** - Formatted number (50K, 100K, 1M)
- **Times Used** - Count of bookings using this podcast
- **Actions** - View | Edit | Delete dropdown

#### Add/Edit Podcast Form (Modal)
```typescript
interface PodcastForm {
  name: string           // Required
  url: string
  description: string
  host_name: string
  category: string       // Dropdown with common categories
  ratings: number        // 0-5 stars
  audience_size: number
  is_active: boolean
}

<Dialog>
  <DialogHeader>
    <DialogTitle>Add New Podcast</DialogTitle>
  </DialogHeader>
  <DialogContent>
    <Form>
      <FormField name="name" label="Podcast Name *" />
      <FormField name="url" label="Podcast URL" type="url" />
      <FormField name="host_name" label="Host Name" />
      <div className="flex gap-4">
        <FormField name="category" label="Category" type="select">
          <option value="Business">Business</option>
          <option value="Tech">Technology</option>
          <option value="Marketing">Marketing</option>
          <option value="Entrepreneurship">Entrepreneurship</option>
          <option value="Other">Other</option>
        </FormField>
        <FormField name="ratings" label="Rating" type="number" min="0" max="5" step="0.1" />
      </div>
      <FormField name="audience_size" label="Audience Size" type="number" />
      <FormField name="description" label="Description" type="textarea" />
      <FormField name="is_active" label="Currently Active" type="checkbox" />
      <Button type="submit">Save Podcast</Button>
    </Form>
  </DialogContent>
</Dialog>
```

---

## Page 5: Podcast Detail View (`/admin/podcast-database/:id`)

### Purpose
Detailed view of a single podcast with all clients who've been on it.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to Database                                             │
│                                                                 │
│ Podcast Name                               [Edit] [Delete]     │
│ ⭐ 4.5 • 100K Listeners • Business                            │
├────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────────────────────────────┐│
│ │ Podcast Info    │ │ Usage Stats                             ││
│ │                 │ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ││
│ │ Host: John Doe  │ │ │ Total    │ │ Active   │ │ Last     │ ││
│ │ Category: Biz   │ │ │ Bookings │ │ Bookings │ │ Used     │ ││
│ │ URL: [Link]     │ │ │   12     │ │    3     │ │ 5 days   │ ││
│ │ Active: Yes     │ │ └──────────┘ └──────────┘ └──────────┘ ││
│ │                 │ │                                         ││
│ │ Description...  │ │                                         ││
│ └─────────────────┘ └─────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────────┤
│ Booking History                                                │
│ ┌────────────┬────────────┬────────┬──────────────┐           │
│ │ Client     │ Scheduled  │ Status │ Episode URL  │           │
│ ├────────────┼────────────┼────────┼──────────────┤           │
│ │ Client A   │ 2024-01-15 │Published│ [Link]      │           │
│ │ Client B   │ 2024-02-10 │Recorded│    -         │           │
│ └────────────┴────────────┴────────┴──────────────┘           │
└────────────────────────────────────────────────────────────────┘
```

---

## Page 6: All Bookings View (`/admin/bookings`) - Optional Enhancement

### Purpose
Unified view of all bookings across all clients for quick management.

### Layout
```
┌────────────────────────────────────────────────────────────────┐
│ All Bookings                                                    │
│ Manage all podcast bookings                                    │
├────────────────────────────────────────────────────────────────┤
│ [Filters Row]                                                   │
│ Client: [All ▼]  Status: [All ▼]  Date: [Range Picker]        │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────┬──────────┬────────────┬────────┬──────────┐      │
│ │ Client   │ Podcast  │ Scheduled  │ Status │ Actions  │      │
│ ├──────────┼──────────┼────────────┼────────┼──────────┤      │
│ │ Client A │ Podcast X│ 2024-01-15 │Scheduled│ Edit    │      │
│ └──────────┴──────────┴────────────┴────────┴──────────┘      │
└────────────────────────────────────────────────────────────────┘
```

---

## Shared Components

### Status Badge
```typescript
function StatusBadge({ status }: { status: BookingStatus }) {
  const variants = {
    scheduled: 'bg-blue-100 text-blue-800',
    recorded: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  return (
    <Badge className={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
```

### Client Status Badge
```typescript
function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const variants = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    churned: 'bg-gray-100 text-gray-800',
  }

  return (
    <Badge className={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
```

### Podcast Combobox (Searchable Dropdown)
```typescript
import { Combobox } from '@/components/ui/combobox'

function PodcastSelector({ value, onChange }: Props) {
  const { data: podcasts } = useQuery({
    queryKey: ['podcasts'],
    queryFn: getPodcasts
  })

  return (
    <Combobox
      options={podcasts?.map(p => ({ value: p.id, label: p.name }))}
      value={value}
      onChange={onChange}
      placeholder="Search podcasts..."
    />
  )
}
```

---

## Color Scheme & Design Tokens

### Status Colors
- **Scheduled**: Blue - `bg-blue-500`, `text-blue-600`
- **Recorded**: Yellow/Orange - `bg-yellow-500`, `text-yellow-600`
- **Published**: Green - `bg-green-500`, `text-green-600`
- **Cancelled**: Red - `bg-red-500`, `text-red-600`

### Client Status Colors
- **Active**: Green - `bg-green-500`, `text-green-600`
- **Paused**: Yellow - `bg-yellow-500`, `text-yellow-600`
- **Churned**: Gray - `bg-gray-500`, `text-gray-600`

### Icons (from lucide-react)
- Calendar: `<Calendar />`
- Users: `<Users />`
- Mic: `<Mic />`
- Plus: `<Plus />`
- Edit: `<Edit />`
- Trash: `<Trash />`
- Eye: `<Eye />`
- ExternalLink: `<ExternalLink />`
- Filter: `<Filter />`
- Search: `<Search />`

---

## Responsive Design Breakpoints

### Mobile (< 768px)
- Stack cards vertically
- Convert tables to card-based lists
- Hide less important columns
- Full-width modals

### Tablet (768px - 1024px)
- 2-column card grids
- Show essential table columns only
- Side panels for forms

### Desktop (> 1024px)
- Full table view
- 4-column card grids
- Modals at reasonable width (600-800px)

---

## Animation & Transitions

### Page Transitions
- Fade in: `transition-opacity duration-200`
- Slide up: `transition-transform duration-200`

### Interactive Elements
- Hover: `hover:bg-muted transition-colors`
- Active: `active:scale-95 transition-transform`
- Focus: `focus:ring-2 focus:ring-primary`

### Loading States
- Use `<Skeleton />` component for loading cards
- Use `<Spinner />` for button loading states
- Optimistic updates with React Query

---

## Accessibility

### Keyboard Navigation
- Tab order follows visual order
- Enter to submit forms
- Escape to close modals
- Arrow keys for dropdown navigation

### Screen Readers
- Proper ARIA labels on all interactive elements
- Table headers with proper scope
- Form labels associated with inputs
- Status announcements for async actions

### Color Contrast
- All text meets WCAG AA standards
- Status badges have sufficient contrast
- Focus indicators clearly visible

---

## Performance Considerations

### Data Fetching Strategy
- React Query for caching and background updates
- Pagination for large lists (50-100 items per page)
- Debounced search inputs (300ms)
- Prefetch on hover for detail views

### Code Splitting
- Lazy load detail views
- Dynamic imports for heavy components (calendar grids)
- Separate bundles for admin routes

### Optimizations
- Virtual scrolling for lists > 100 items
- Memoize expensive computations
- Optimize re-renders with React.memo
- Use indexes for database queries (already in migration)
