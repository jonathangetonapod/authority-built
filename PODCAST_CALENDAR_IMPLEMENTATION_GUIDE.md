# Podcast Calendar System - Implementation Guide

This guide provides step-by-step instructions for implementing the Podcast Calendar Management System.

---

## Phase 1: Database Setup (1-2 hours)

### Step 1.1: Run Database Migration

```bash
# Push the migration to Supabase
npx supabase db push

# Or if using Railway/direct connection:
# Apply the migration file manually through Supabase dashboard
```

The migration file is located at:
```
supabase/migrations/20251227_podcast_calendar_system.sql
```

### Step 1.2: Verify Tables Created

Run in Supabase SQL Editor:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'podcasts', 'client_podcast_bookings');

-- Check views exist
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('client_monthly_bookings', 'booking_details');

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'podcasts', 'client_podcast_bookings');
```

### Step 1.3: Test with Sample Data (Optional)

```sql
-- Insert test client
INSERT INTO public.clients (name, email, status)
VALUES ('Test Client', 'test@example.com', 'active');

-- Insert test podcast
INSERT INTO public.podcasts (name, host_name, audience_size)
VALUES ('Test Podcast', 'John Doe', 50000);

-- Insert test booking
INSERT INTO public.client_podcast_bookings (
  client_id,
  podcast_id,
  scheduled_date,
  status
)
VALUES (
  (SELECT id FROM clients WHERE name = 'Test Client'),
  (SELECT id FROM podcasts WHERE name = 'Test Podcast'),
  '2025-01-15',
  'scheduled'
);

-- Query booking details view
SELECT * FROM booking_details;

-- Clean up test data
DELETE FROM client_podcast_bookings WHERE podcast_id IN (SELECT id FROM podcasts WHERE name = 'Test Podcast');
DELETE FROM podcasts WHERE name = 'Test Podcast';
DELETE FROM clients WHERE name = 'Test Client';
```

---

## Phase 2: Service Layer (3-4 hours)

### Step 2.1: Create `src/services/clients.ts`

```bash
touch src/services/clients.ts
```

Implement all functions from `PODCAST_CALENDAR_API_SPEC.md`:
- `getClients()`
- `getClientById()`
- `createClient()`
- `updateClient()`
- `deleteClient()`
- `getClientStats()`

**Key Points:**
- Use existing `supabase` import pattern
- Follow error handling convention from other services
- Export TypeScript interfaces at top of file
- Test each function in isolation

### Step 2.2: Create `src/services/podcasts.ts`

```bash
touch src/services/podcasts.ts
```

Implement:
- `getPodcasts()`
- `getPodcastById()`
- `createPodcast()`
- `updatePodcast()`
- `deletePodcast()`
- `searchPodcasts()` (for dropdown)
- `getPodcastStats()`

### Step 2.3: Create `src/services/bookings.ts`

```bash
touch src/services/bookings.ts
```

Implement:
- `getBookings()`
- `getBookingById()`
- `createBooking()`
- `updateBooking()`
- `deleteBooking()`
- `bulkUpdateBookingStatus()`
- `getBookingStats()`

### Step 2.4: Create `src/services/calendar.ts`

```bash
touch src/services/calendar.ts
```

Implement:
- `getCalendarData()` (most complex function)
- `getCalendarStats()`

**Testing Services:**

Create a test page or use browser console:

```typescript
import * as clientsService from '@/services/clients'

// Test in component or console
const testClients = async () => {
  try {
    const result = await clientsService.getClients({ limit: 10 })
    console.log('Clients:', result)
  } catch (error) {
    console.error('Error:', error)
  }
}
```

---

## Phase 3: Basic UI Components (4-6 hours)

### Step 3.1: Update Navigation

Edit `src/components/admin/DashboardLayout.tsx`:

```typescript
// Add to imports
import { Calendar, Mic } from 'lucide-react'

// Add to defaultNavItems array
const defaultNavItems: NavItem[] = [
  // ... existing items
  { id: 'calendar', name: 'Podcast Calendar', href: '/admin/calendar', icon: Calendar },
  { id: 'clients', name: 'Clients', href: '/admin/clients', icon: Users },
  { id: 'podcast-database', name: 'Podcast Database', href: '/admin/podcast-database', icon: Mic },
]
```

### Step 3.2: Create Clients Management Page

```bash
touch src/pages/admin/ClientsManagement.tsx
```

**Start Simple:**

```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getClients } from '@/services/clients'

export default function ClientsManagement() {
  const [searchTerm, setSearchTerm] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['clients', searchTerm],
    queryFn: () => getClients({ search: searchTerm })
  })

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-muted-foreground">Manage your podcast placement clients</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Client List</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {isLoading && <p>Loading...</p>}

            {data && (
              <p className="mt-4">Found {data.total} clients</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
```

**Then Iterate:**
1. Add stats cards
2. Add table with data
3. Add "Add Client" button and modal
4. Add edit/delete actions
5. Add client detail view

### Step 3.3: Add Route

Edit `src/App.tsx` or your router config:

```typescript
import ClientsManagement from '@/pages/admin/ClientsManagement'

// Add route
<Route path="/admin/clients" element={<ClientsManagement />} />
```

### Step 3.4: Create Shared Components

Create reusable components:

#### `src/components/admin/StatusBadge.tsx`

```typescript
import { Badge } from '@/components/ui/badge'

type BookingStatus = 'scheduled' | 'recorded' | 'published' | 'cancelled'

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const variants = {
    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    recorded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }

  return (
    <Badge className={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

type ClientStatus = 'active' | 'paused' | 'churned'

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const variants = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    churned: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  }

  return (
    <Badge className={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
```

#### `src/components/admin/PodcastSelector.tsx`

```typescript
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { searchPodcasts } from '@/services/podcasts'

interface PodcastSelectorProps {
  value?: string
  onChange: (value: string) => void
}

export function PodcastSelector({ value, onChange }: PodcastSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: podcasts } = useQuery({
    queryKey: ['podcasts-search', searchTerm],
    queryFn: () => searchPodcasts(searchTerm),
    enabled: open
  })

  const selectedPodcast = podcasts?.find(p => p.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedPodcast ? selectedPodcast.name : 'Select podcast...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput
            placeholder="Search podcasts..."
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandEmpty>No podcast found.</CommandEmpty>
          <CommandGroup>
            {podcasts?.map((podcast) => (
              <CommandItem
                key={podcast.id}
                value={podcast.id}
                onSelect={() => {
                  onChange(podcast.id)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === podcast.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {podcast.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

---

## Phase 4: Calendar View (4-6 hours)

### Step 4.1: Create Calendar Dashboard Page

```bash
touch src/pages/admin/CalendarDashboard.tsx
```

This is the most complex view. Break it down:

#### 4.1.1: Stats Cards (use existing pattern)

```typescript
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
      <Users className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{stats.activeClients}</div>
    </CardContent>
  </Card>
  {/* ... more stats cards */}
</div>
```

#### 4.1.2: Year Selector & Search

```typescript
<div className="flex items-center gap-4">
  <Select value={year.toString()} onValueChange={(val) => setYear(parseInt(val))}>
    <SelectTrigger className="w-[180px]">
      <SelectValue placeholder="Select year" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="2024">2024</SelectItem>
      <SelectItem value="2025">2025</SelectItem>
      <SelectItem value="2026">2026</SelectItem>
    </SelectContent>
  </Select>

  <Input
    placeholder="Search clients..."
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    className="max-w-xs"
  />
</div>
```

#### 4.1.3: Calendar Grid Table

```typescript
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-[200px]">Client</TableHead>
      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
        <TableHead key={month} className="text-center">{month}</TableHead>
      ))}
    </TableRow>
  </TableHeader>
  <TableBody>
    {calendarData?.clients.map(client => (
      <TableRow key={client.id}>
        <TableCell className="font-medium">
          <Link to={`/admin/clients/${client.id}`}>
            {client.name}
          </Link>
        </TableCell>
        {client.months.map(monthData => (
          <TableCell key={monthData.month} className="text-center">
            {monthData.count > 0 ? (
              <button
                className="text-green-600 hover:underline font-semibold"
                onClick={() => handleMonthClick(client.id, monthData.month)}
              >
                {monthData.count}
              </button>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        ))}
      </TableRow>
    ))}
  </TableBody>
</Table>
```

#### 4.1.4: Month Detail Modal

When clicking a number, show modal with bookings for that client/month:

```typescript
const [selectedMonth, setSelectedMonth] = useState<{
  clientId: string
  month: number
} | null>(null)

const handleMonthClick = (clientId: string, month: number) => {
  setSelectedMonth({ clientId, month })
}

// In JSX
<Dialog open={!!selectedMonth} onOpenChange={() => setSelectedMonth(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Bookings for {monthName}</DialogTitle>
    </DialogHeader>
    {/* Show table of bookings for that month */}
  </DialogContent>
</Dialog>
```

---

## Phase 5: Forms & CRUD Operations (4-6 hours)

### Step 5.1: Client Form Component

```bash
touch src/components/admin/ClientForm.tsx
```

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  contact_person: z.string().optional(),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  calendar_link: z.string().url().optional().or(z.literal('')),
  status: z.enum(['active', 'paused', 'churned']),
  notes: z.string().optional()
})

type ClientFormValues = z.infer<typeof clientSchema>

interface ClientFormProps {
  initialValues?: Partial<ClientFormValues>
  onSubmit: (values: ClientFormValues) => void
  isLoading?: boolean
}

export function ClientForm({ initialValues, onSubmit, isLoading }: ClientFormProps) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: initialValues || {
      name: '',
      email: '',
      status: 'active'
    }
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client Name *</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Add more fields... */}

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Client'}
        </Button>
      </form>
    </Form>
  )
}
```

### Step 5.2: Use Form in Modal

In `ClientsManagement.tsx`:

```typescript
const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

const createMutation = useMutation({
  mutationFn: createClient,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] })
    toast.success('Client created successfully')
    setIsCreateModalOpen(false)
  },
  onError: (error) => {
    toast.error(`Failed to create client: ${error.message}`)
  }
})

// In JSX
<Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add New Client</DialogTitle>
    </DialogHeader>
    <ClientForm
      onSubmit={(values) => createMutation.mutate(values)}
      isLoading={createMutation.isPending}
    />
  </DialogContent>
</Dialog>
```

### Step 5.3: Repeat for Other Forms

Create similar forms for:
- `PodcastForm.tsx`
- `BookingForm.tsx`

---

## Phase 6: Client Detail View (3-4 hours)

### Step 6.1: Create Page

```bash
touch src/pages/admin/ClientDetail.tsx
```

### Step 6.2: Implement Layout

```typescript
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { getClientById } from '@/services/clients'
import { ArrowLeft } from 'lucide-react'

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClientById(id!),
    enabled: !!id
  })

  if (isLoading) return <div>Loading...</div>
  if (!client) return <div>Client not found</div>

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back button */}
        <Link to="/admin/clients" className="flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{client.name}</h1>
            <ClientStatusBadge status={client.status} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Edit</Button>
            <Button variant="destructive">Delete</Button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <span className="text-sm text-muted-foreground">Email:</span>
                <p>{client.email || 'N/A'}</p>
              </div>
              {/* ... more fields */}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {/* Quick stats cards */}
          </div>
        </div>

        {/* Bookings table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Bookings</CardTitle>
              <Button>Add Booking</Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Bookings table */}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
```

### Step 6.3: Add Route

```typescript
<Route path="/admin/clients/:id" element={<ClientDetail />} />
```

---

## Phase 7: Podcast Database Pages (2-3 hours)

### Step 7.1: Create Podcast Management Page

Similar structure to Clients Management:
1. Stats cards
2. Search/filter
3. Table with data
4. Add/edit/delete functionality

```bash
touch src/pages/admin/PodcastDatabase.tsx
```

### Step 7.2: Create Podcast Detail Page

```bash
touch src/pages/admin/PodcastDetail.tsx
```

### Step 7.3: Add Routes

```typescript
<Route path="/admin/podcast-database" element={<PodcastDatabase />} />
<Route path="/admin/podcast-database/:id" element={<PodcastDetail />} />
```

---

## Phase 8: Polish & Testing (2-3 hours)

### Step 8.1: Add Loading States

Everywhere you use `useQuery`, add proper loading UI:

```typescript
{isLoading && (
  <div className="space-y-2">
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-12 w-full" />
  </div>
)}

{error && (
  <div className="text-red-500">
    Error: {error.message}
  </div>
)}

{data && (
  // Render data
)}
```

### Step 8.2: Add Toast Notifications

For all mutations:

```typescript
const mutation = useMutation({
  mutationFn: someFunction,
  onSuccess: () => {
    toast.success('Action completed successfully')
  },
  onError: (error) => {
    toast.error(`Action failed: ${error.message}`)
  }
})
```

### Step 8.3: Add Confirmation Dialogs

For destructive actions:

```typescript
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete the client
        and all associated bookings.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Step 8.4: Responsive Design Testing

Test on:
- Mobile (< 768px)
- Tablet (768px - 1024px)
- Desktop (> 1024px)

Add responsive classes where needed:
```typescript
className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
className="hidden md:table-cell" // Hide on mobile
```

### Step 8.5: Accessibility Audit

- Tab through forms
- Test with screen reader
- Ensure proper ARIA labels
- Check color contrast

---

## Phase 9: Data Migration (Optional, 2-3 hours)

If you want to import existing Google Sheets data:

### Step 9.1: Export Sheets to CSV

Download your Google Sheets as CSV files.

### Step 9.2: Create Import Script

```bash
touch scripts/import-sheets-data.ts
```

```typescript
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import csv from 'csv-parser'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin operations
)

async function importClients(csvPath: string) {
  const clients: any[] = []

  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (row) => {
      clients.push({
        name: row['Client Name'],
        email: row['Email'],
        status: 'active'
      })
    })
    .on('end', async () => {
      const { error } = await supabase
        .from('clients')
        .insert(clients)

      if (error) {
        console.error('Import failed:', error)
      } else {
        console.log(`Imported ${clients.length} clients`)
      }
    })
}

// Run imports
importClients('data/clients.csv')
```

---

## Common Issues & Solutions

### Issue: RLS Blocking Queries

**Symptom:** Queries return empty even though data exists.

**Solution:** Ensure user is authenticated:
```typescript
const { data: { user } } = await supabase.auth.getUser()
console.log('Authenticated as:', user?.email)
```

Check RLS policies allow authenticated users.

### Issue: Foreign Key Constraint Errors

**Symptom:** Cannot delete podcast because bookings reference it.

**Solution:** Either:
1. Delete all bookings first
2. Change migration from `ON DELETE RESTRICT` to `ON DELETE CASCADE` (not recommended)
3. Soft delete: Add `is_deleted` boolean instead

### Issue: Slow Calendar Queries

**Symptom:** Calendar page loads slowly with many clients.

**Solution:**
1. Add pagination
2. Use the `client_monthly_bookings` view (optimized)
3. Add caching with React Query
4. Consider server-side filtering

### Issue: Type Errors

**Symptom:** TypeScript errors about missing properties.

**Solution:** Ensure service return types match database schema:
```typescript
// Update types to match actual database columns
export interface Client {
  // Use snake_case to match database
  first_invoice_paid_date: string | null
  // Not firstInvoicePaidDate
}
```

---

## Testing Checklist

### Functionality
- [ ] Create client
- [ ] Edit client
- [ ] Delete client
- [ ] View client detail
- [ ] Create podcast
- [ ] Edit podcast
- [ ] Delete podcast (with and without bookings)
- [ ] Create booking
- [ ] Edit booking
- [ ] Delete booking
- [ ] View calendar grid
- [ ] Filter calendar by year
- [ ] Search clients
- [ ] View monthly booking detail

### UI/UX
- [ ] All forms validate properly
- [ ] Error messages are clear
- [ ] Success toasts appear
- [ ] Loading states show
- [ ] Empty states handled
- [ ] Tables are sortable
- [ ] Modals close properly
- [ ] Back buttons work
- [ ] Links navigate correctly

### Performance
- [ ] Calendar loads in < 2 seconds
- [ ] Search debounces properly
- [ ] No unnecessary re-renders
- [ ] Tables paginate large datasets
- [ ] Images/icons load quickly

### Responsive
- [ ] Mobile view works
- [ ] Tablet view works
- [ ] Desktop view works
- [ ] Forms are usable on mobile
- [ ] Tables scroll on small screens

---

## Deployment Checklist

### Before Deploy
- [ ] Run migration on production database
- [ ] Test all functionality in staging
- [ ] Check RLS policies are correct
- [ ] Verify authentication works
- [ ] Test with real data
- [ ] Review error handling

### Deploy Steps
1. Commit all changes
2. Push to GitHub
3. Railway auto-deploys
4. Run migration in production:
   ```bash
   npx supabase db push --db-url $DATABASE_URL
   ```
5. Verify production works
6. Monitor for errors

### Post-Deploy
- [ ] Test key flows in production
- [ ] Check error logs
- [ ] Verify data migration (if done)
- [ ] Update documentation
- [ ] Train users on new features

---

## Future Enhancements

After initial implementation, consider:

### Phase 10: Advanced Features
- Timeline/Gantt view for calendar
- Drag-and-drop to reschedule bookings
- Bulk import from CSV
- Export calendar to PDF/Excel
- Email reminders for upcoming recordings
- Client portal (view their own bookings)

### Phase 11: Integrations
- Google Calendar sync
- Calendly integration
- Slack notifications
- Email automation
- CRM integration

### Phase 12: Analytics
- Booking trends over time
- Client lifetime value
- Podcast performance metrics
- Revenue tracking per client
- Booking conversion rates

---

## Getting Help

If you get stuck:

1. **Check Supabase docs:** https://supabase.com/docs
2. **React Query docs:** https://tanstack.com/query/latest/docs
3. **shadcn/ui components:** https://ui.shadcn.com
4. **Review existing code:** Look at similar pages (CustomersManagement, Analytics)
5. **Console logging:** Add `console.log` to debug issues
6. **Supabase SQL Editor:** Test queries directly

---

## Success Criteria

The implementation is complete when:

- ✅ All tables are created and working
- ✅ All CRUD operations work for clients, podcasts, bookings
- ✅ Calendar view displays correctly
- ✅ Can search and filter data
- ✅ Forms validate and submit properly
- ✅ UI is responsive on all devices
- ✅ Loading and error states handled
- ✅ No console errors
- ✅ User can accomplish all tasks from original plan

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 1. Database Setup | 1-2 hours | 1-2 hours |
| 2. Service Layer | 3-4 hours | 4-6 hours |
| 3. Basic UI | 4-6 hours | 8-12 hours |
| 4. Calendar View | 4-6 hours | 12-18 hours |
| 5. Forms & CRUD | 4-6 hours | 16-24 hours |
| 6. Client Detail | 3-4 hours | 19-28 hours |
| 7. Podcast Pages | 2-3 hours | 21-31 hours |
| 8. Polish & Testing | 2-3 hours | 23-34 hours |
| 9. Data Migration | 2-3 hours | 25-37 hours |

**Total: 25-37 hours of development time**

For a developer working 4-6 hours/day, this is roughly **1-2 weeks** of work.

---

## Next Steps

Ready to start? Begin with:

1. ✅ Review this plan
2. ✅ Run the database migration (Phase 1)
3. ✅ Create one service file and test it (Phase 2.1)
4. ✅ Build one simple page (Phase 3.2)
5. ✅ Iterate from there

You've got comprehensive docs to refer to. Take it step by step, and you'll have a fully functional podcast calendar system!
