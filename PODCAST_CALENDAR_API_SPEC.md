# Podcast Calendar System - API Specification

## Overview
This document outlines all API endpoints (service functions) needed for the Podcast Calendar Management System. Each service corresponds to a TypeScript module in `src/services/`.

---

## Service: `src/services/clients.ts`

### Type Definitions

```typescript
export interface Client {
  id: string
  name: string
  linkedin_url: string | null
  website: string | null
  calendar_link: string | null
  contact_person: string | null
  email: string | null
  first_invoice_paid_date: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ClientWithBookings extends Client {
  bookings: BookingDetail[]
  booking_count?: number
  last_booking_date?: string | null
}

export interface ClientStats {
  totalClients: number
  activeClients: number
  pausedClients: number
  churnedClients: number
  avgBookingsPerClient: number
}

export interface CreateClientInput {
  name: string
  email?: string
  linkedin_url?: string
  website?: string
  calendar_link?: string
  contact_person?: string
  first_invoice_paid_date?: string
  status?: 'active' | 'paused' | 'churned'
  notes?: string
}

export interface UpdateClientInput extends Partial<CreateClientInput> {
  id: string
}
```

### Functions

#### `getClients(options?)`
Get all clients with optional filtering and pagination.

```typescript
export async function getClients(options?: {
  search?: string
  status?: 'active' | 'paused' | 'churned'
  limit?: number
  offset?: number
  orderBy?: 'name' | 'created_at' | 'booking_count'
  orderDirection?: 'asc' | 'desc'
}): Promise<{ clients: Client[], total: number }>
```

**Implementation:**
```typescript
let query = supabase
  .from('clients')
  .select('*', { count: 'exact' })

// Search by name or email
if (options?.search) {
  query = query.or(`name.ilike.%${options.search}%,email.ilike.%${options.search}%`)
}

// Filter by status
if (options?.status) {
  query = query.eq('status', options.status)
}

// Order by
const orderBy = options?.orderBy || 'created_at'
const orderDirection = options?.orderDirection || 'desc'
query = query.order(orderBy, { ascending: orderDirection === 'asc' })

// Pagination
if (options?.limit) {
  query = query.limit(options.limit)
}
if (options?.offset) {
  query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
}

const { data, error, count } = await query

if (error) throw new Error(`Failed to fetch clients: ${error.message}`)

return { clients: data as Client[], total: count || 0 }
```

---

#### `getClientById(clientId)`
Get a single client by ID with all their bookings.

```typescript
export async function getClientById(clientId: string): Promise<ClientWithBookings>
```

**Implementation:**
```typescript
const { data, error } = await supabase
  .from('clients')
  .select(`
    *,
    bookings:client_podcast_bookings(
      *,
      podcast:podcasts(*)
    )
  `)
  .eq('id', clientId)
  .single()

if (error) throw new Error(`Failed to fetch client: ${error.message}`)

return data as ClientWithBookings
```

---

#### `createClient(input)`
Create a new client.

```typescript
export async function createClient(input: CreateClientInput): Promise<Client>
```

**Implementation:**
```typescript
const { data, error } = await supabase
  .from('clients')
  .insert([input])
  .select()
  .single()

if (error) throw new Error(`Failed to create client: ${error.message}`)

return data as Client
```

---

#### `updateClient(input)`
Update an existing client.

```typescript
export async function updateClient(input: UpdateClientInput): Promise<Client>
```

**Implementation:**
```typescript
const { id, ...updates } = input

const { data, error } = await supabase
  .from('clients')
  .update(updates)
  .eq('id', id)
  .select()
  .single()

if (error) throw new Error(`Failed to update client: ${error.message}`)

return data as Client
```

---

#### `deleteClient(clientId)`
Delete a client (will cascade delete all bookings).

```typescript
export async function deleteClient(clientId: string): Promise<void>
```

**Implementation:**
```typescript
const { error } = await supabase
  .from('clients')
  .delete()
  .eq('id', clientId)

if (error) throw new Error(`Failed to delete client: ${error.message}`)
```

---

#### `getClientStats()`
Get aggregate statistics about clients.

```typescript
export async function getClientStats(): Promise<ClientStats>
```

**Implementation:**
```typescript
// Total clients
const { count: totalClients } = await supabase
  .from('clients')
  .select('*', { count: 'exact', head: true })

// Active clients
const { count: activeClients } = await supabase
  .from('clients')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'active')

// Paused clients
const { count: pausedClients } = await supabase
  .from('clients')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'paused')

// Churned clients
const { count: churnedClients } = await supabase
  .from('clients')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'churned')

// Average bookings per client
const { data: bookingsData } = await supabase
  .from('client_podcast_bookings')
  .select('client_id')

const avgBookingsPerClient = totalClients && totalClients > 0
  ? (bookingsData?.length || 0) / totalClients
  : 0

return {
  totalClients: totalClients || 0,
  activeClients: activeClients || 0,
  pausedClients: pausedClients || 0,
  churnedClients: churnedClients || 0,
  avgBookingsPerClient
}
```

---

## Service: `src/services/podcasts.ts`

### Type Definitions

```typescript
export interface Podcast {
  id: string
  name: string
  url: string | null
  description: string | null
  ratings: number | null
  audience_size: number | null
  host_name: string | null
  category: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PodcastWithUsage extends Podcast {
  times_used: number
  last_used?: string | null
}

export interface PodcastStats {
  totalPodcasts: number
  activePodcasts: number
  avgRating: number
  totalUsage: number
}

export interface CreatePodcastInput {
  name: string
  url?: string
  description?: string
  ratings?: number
  audience_size?: number
  host_name?: string
  category?: string
  is_active?: boolean
}

export interface UpdatePodcastInput extends Partial<CreatePodcastInput> {
  id: string
}
```

### Functions

#### `getPodcasts(options?)`
Get all podcasts with optional filtering.

```typescript
export async function getPodcasts(options?: {
  search?: string
  category?: string
  is_active?: boolean
  min_audience_size?: number
  limit?: number
  offset?: number
  orderBy?: 'name' | 'audience_size' | 'ratings' | 'created_at'
  orderDirection?: 'asc' | 'desc'
}): Promise<{ podcasts: Podcast[], total: number }>
```

---

#### `getPodcastById(podcastId)`
Get a single podcast with booking history.

```typescript
export async function getPodcastById(podcastId: string): Promise<PodcastWithUsage>
```

---

#### `createPodcast(input)`
Create a new podcast.

```typescript
export async function createPodcast(input: CreatePodcastInput): Promise<Podcast>
```

---

#### `updatePodcast(input)`
Update an existing podcast.

```typescript
export async function updatePodcast(input: UpdatePodcastInput): Promise<Podcast>
```

---

#### `deletePodcast(podcastId)`
Delete a podcast (will fail if used in bookings due to RESTRICT constraint).

```typescript
export async function deletePodcast(podcastId: string): Promise<void>
```

---

#### `searchPodcasts(searchTerm)`
Quick search for podcast selector dropdown.

```typescript
export async function searchPodcasts(searchTerm: string): Promise<Podcast[]>
```

**Implementation:**
```typescript
const { data, error } = await supabase
  .from('podcasts')
  .select('*')
  .ilike('name', `%${searchTerm}%`)
  .eq('is_active', true)
  .order('name')
  .limit(20)

if (error) throw new Error(`Failed to search podcasts: ${error.message}`)

return data as Podcast[]
```

---

#### `getPodcastStats()`
Get aggregate statistics about podcasts.

```typescript
export async function getPodcastStats(): Promise<PodcastStats>
```

---

## Service: `src/services/bookings.ts`

### Type Definitions

```typescript
export interface Booking {
  id: string
  client_id: string
  podcast_id: string
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  status: 'scheduled' | 'recorded' | 'published' | 'cancelled'
  episode_url: string | null
  notes: string | null
  prep_sent: boolean
  created_at: string
  updated_at: string
}

export interface BookingDetail extends Booking {
  client: Client
  podcast: Podcast
}

export interface CreateBookingInput {
  client_id: string
  podcast_id: string
  scheduled_date?: string
  recording_date?: string
  publish_date?: string
  status?: 'scheduled' | 'recorded' | 'published' | 'cancelled'
  episode_url?: string
  notes?: string
  prep_sent?: boolean
}

export interface UpdateBookingInput extends Partial<CreateBookingInput> {
  id: string
}

export interface BookingStats {
  totalBookings: number
  scheduledBookings: number
  recordedBookings: number
  publishedBookings: number
  upcomingThisWeek: number
  upcomingThisMonth: number
}
```

### Functions

#### `getBookings(options?)`
Get all bookings with optional filtering.

```typescript
export async function getBookings(options?: {
  client_id?: string
  podcast_id?: string
  status?: 'scheduled' | 'recorded' | 'published' | 'cancelled'
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
  orderBy?: 'scheduled_date' | 'created_at'
  orderDirection?: 'asc' | 'desc'
}): Promise<{ bookings: BookingDetail[], total: number }>
```

**Implementation:**
```typescript
let query = supabase
  .from('client_podcast_bookings')
  .select(`
    *,
    client:clients(*),
    podcast:podcasts(*)
  `, { count: 'exact' })

// Filter by client
if (options?.client_id) {
  query = query.eq('client_id', options.client_id)
}

// Filter by podcast
if (options?.podcast_id) {
  query = query.eq('podcast_id', options.podcast_id)
}

// Filter by status
if (options?.status) {
  query = query.eq('status', options.status)
}

// Filter by date range
if (options?.date_from) {
  query = query.gte('scheduled_date', options.date_from)
}
if (options?.date_to) {
  query = query.lte('scheduled_date', options.date_to)
}

// Order by
const orderBy = options?.orderBy || 'scheduled_date'
const orderDirection = options?.orderDirection || 'desc'
query = query.order(orderBy, { ascending: orderDirection === 'asc' })

// Pagination
if (options?.limit) {
  query = query.limit(options.limit)
}
if (options?.offset) {
  query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
}

const { data, error, count } = await query

if (error) throw new Error(`Failed to fetch bookings: ${error.message}`)

return { bookings: data as BookingDetail[], total: count || 0 }
```

---

#### `getBookingById(bookingId)`
Get a single booking by ID.

```typescript
export async function getBookingById(bookingId: string): Promise<BookingDetail>
```

---

#### `createBooking(input)`
Create a new booking.

```typescript
export async function createBooking(input: CreateBookingInput): Promise<Booking>
```

---

#### `updateBooking(input)`
Update an existing booking.

```typescript
export async function updateBooking(input: UpdateBookingInput): Promise<Booking>
```

---

#### `deleteBooking(bookingId)`
Delete a booking.

```typescript
export async function deleteBooking(bookingId: string): Promise<void>
```

---

#### `getBookingStats()`
Get aggregate statistics about bookings.

```typescript
export async function getBookingStats(): Promise<BookingStats>
```

**Implementation:**
```typescript
const now = new Date()
const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

// Total bookings
const { count: totalBookings } = await supabase
  .from('client_podcast_bookings')
  .select('*', { count: 'exact', head: true })

// By status
const { count: scheduledBookings } = await supabase
  .from('client_podcast_bookings')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'scheduled')

const { count: recordedBookings } = await supabase
  .from('client_podcast_bookings')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'recorded')

const { count: publishedBookings } = await supabase
  .from('client_podcast_bookings')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'published')

// Upcoming this week
const { count: upcomingThisWeek } = await supabase
  .from('client_podcast_bookings')
  .select('*', { count: 'exact', head: true })
  .gte('scheduled_date', now.toISOString())
  .lte('scheduled_date', weekFromNow.toISOString())
  .in('status', ['scheduled', 'recorded'])

// Upcoming this month
const { count: upcomingThisMonth } = await supabase
  .from('client_podcast_bookings')
  .select('*', { count: 'exact', head: true })
  .gte('scheduled_date', monthStart.toISOString())
  .lte('scheduled_date', monthEnd.toISOString())
  .in('status', ['scheduled', 'recorded'])

return {
  totalBookings: totalBookings || 0,
  scheduledBookings: scheduledBookings || 0,
  recordedBookings: recordedBookings || 0,
  publishedBookings: publishedBookings || 0,
  upcomingThisWeek: upcomingThisWeek || 0,
  upcomingThisMonth: upcomingThisMonth || 0
}
```

---

#### `bulkUpdateBookingStatus(bookingIds, status)`
Update multiple bookings at once.

```typescript
export async function bulkUpdateBookingStatus(
  bookingIds: string[],
  status: 'scheduled' | 'recorded' | 'published' | 'cancelled'
): Promise<void>
```

**Implementation:**
```typescript
const { error } = await supabase
  .from('client_podcast_bookings')
  .update({ status })
  .in('id', bookingIds)

if (error) throw new Error(`Failed to bulk update bookings: ${error.message}`)
```

---

## Service: `src/services/calendar.ts`

### Type Definitions

```typescript
export interface MonthlyBooking {
  year: number
  month: number
  client_id: string
  client_name: string
  booking_count: number
  scheduled_count: number
  recorded_count: number
  published_count: number
}

export interface CalendarData {
  clients: ClientCalendarRow[]
  stats: CalendarStats
}

export interface ClientCalendarRow {
  id: string
  name: string
  status: 'active' | 'paused' | 'churned'
  months: MonthData[]
}

export interface MonthData {
  month: number // 1-12
  count: number
  breakdown: {
    scheduled: number
    recorded: number
    published: number
  }
}

export interface CalendarStats {
  activeClients: number
  thisMonthTotal: number
  nextWeekTotal: number
  thisYearTotal: number
}
```

### Functions

#### `getCalendarData(year, options?)`
Get calendar grid data for a specific year.

```typescript
export async function getCalendarData(
  year: number,
  options?: {
    search?: string
    status?: 'active' | 'paused' | 'churned'
  }
): Promise<CalendarData>
```

**Implementation:**
```typescript
// Get clients
let clientsQuery = supabase
  .from('clients')
  .select('id, name, status')
  .order('name')

if (options?.search) {
  clientsQuery = clientsQuery.ilike('name', `%${options.search}%`)
}

if (options?.status) {
  clientsQuery = clientsQuery.eq('status', options.status)
}

const { data: clients, error: clientsError } = await clientsQuery

if (clientsError) throw new Error(`Failed to fetch clients: ${clientsError.message}`)

// Get bookings for the year
const yearStart = `${year}-01-01`
const yearEnd = `${year}-12-31`

const { data: bookings, error: bookingsError } = await supabase
  .from('client_podcast_bookings')
  .select('client_id, scheduled_date, status')
  .gte('scheduled_date', yearStart)
  .lte('scheduled_date', yearEnd)

if (bookingsError) throw new Error(`Failed to fetch bookings: ${bookingsError.message}`)

// Group bookings by client and month
const calendarRows: ClientCalendarRow[] = clients.map(client => {
  const clientBookings = bookings.filter(b => b.client_id === client.id)

  const months: MonthData[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthBookings = clientBookings.filter(b => {
      const bookingMonth = new Date(b.scheduled_date).getMonth() + 1
      return bookingMonth === month
    })

    return {
      month,
      count: monthBookings.length,
      breakdown: {
        scheduled: monthBookings.filter(b => b.status === 'scheduled').length,
        recorded: monthBookings.filter(b => b.status === 'recorded').length,
        published: monthBookings.filter(b => b.status === 'published').length
      }
    }
  })

  return {
    id: client.id,
    name: client.name,
    status: client.status,
    months
  }
})

// Calculate stats
const stats = await getCalendarStats(year)

return {
  clients: calendarRows,
  stats
}
```

---

#### `getCalendarStats(year)`
Get statistics for the calendar view.

```typescript
async function getCalendarStats(year: number): Promise<CalendarStats>
```

---

## React Query Integration Examples

### In Components

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as clientsService from '@/services/clients'
import * as bookingsService from '@/services/bookings'

// Fetch clients list
const { data: clientsData, isLoading } = useQuery({
  queryKey: ['clients', searchTerm, statusFilter],
  queryFn: () => clientsService.getClients({
    search: searchTerm,
    status: statusFilter,
    limit: 50
  })
})

// Fetch single client
const { data: client } = useQuery({
  queryKey: ['client', clientId],
  queryFn: () => clientsService.getClientById(clientId),
  enabled: !!clientId
})

// Create client mutation
const queryClient = useQueryClient()
const createClientMutation = useMutation({
  mutationFn: clientsService.createClient,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] })
    toast.success('Client created successfully')
  },
  onError: (error) => {
    toast.error(`Failed to create client: ${error.message}`)
  }
})

// Usage
const handleCreateClient = (data: CreateClientInput) => {
  createClientMutation.mutate(data)
}
```

---

## Error Handling Pattern

All service functions should follow this error handling pattern:

```typescript
export async function someFunction() {
  const { data, error } = await supabase
    .from('table')
    .select()

  if (error) {
    console.error('Database error:', error)
    throw new Error(`Failed to fetch data: ${error.message}`)
  }

  return data
}
```

In components, catch errors in React Query:

```typescript
const { data, error, isLoading } = useQuery({
  queryKey: ['key'],
  queryFn: someFunction,
  retry: 1,
  onError: (error) => {
    toast.error(error.message)
  }
})
```

---

## Caching Strategy

### Query Keys Convention
```typescript
// Lists
['clients']
['clients', searchTerm]
['clients', searchTerm, statusFilter]

// Details
['client', clientId]
['client', clientId, 'bookings']

// Calendar
['calendar', year]
['calendar', year, searchTerm]

// Stats
['client-stats']
['booking-stats']
['podcast-stats']
```

### Cache Invalidation
```typescript
// After creating/updating/deleting a client
queryClient.invalidateQueries({ queryKey: ['clients'] })
queryClient.invalidateQueries({ queryKey: ['client-stats'] })

// After creating/updating/deleting a booking
queryClient.invalidateQueries({ queryKey: ['bookings'] })
queryClient.invalidateQueries({ queryKey: ['client', clientId] })
queryClient.invalidateQueries({ queryKey: ['calendar'] })
queryClient.invalidateQueries({ queryKey: ['booking-stats'] })

// After creating/updating/deleting a podcast
queryClient.invalidateQueries({ queryKey: ['podcasts'] })
queryClient.invalidateQueries({ queryKey: ['podcast-stats'] })
```

---

## Optimistic Updates Example

For better UX, use optimistic updates:

```typescript
const updateBookingMutation = useMutation({
  mutationFn: bookingsService.updateBooking,
  onMutate: async (updatedBooking) => {
    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['booking', updatedBooking.id] })

    // Snapshot the previous value
    const previousBooking = queryClient.getQueryData(['booking', updatedBooking.id])

    // Optimistically update to the new value
    queryClient.setQueryData(['booking', updatedBooking.id], updatedBooking)

    // Return context with the snapshotted value
    return { previousBooking }
  },
  onError: (err, updatedBooking, context) => {
    // Rollback to the previous value on error
    queryClient.setQueryData(
      ['booking', updatedBooking.id],
      context.previousBooking
    )
  },
  onSettled: (updatedBooking) => {
    // Always refetch after error or success
    queryClient.invalidateQueries({ queryKey: ['booking', updatedBooking.id] })
  }
})
```

---

## Next Steps

1. Create service files (`src/services/clients.ts`, `podcasts.ts`, `bookings.ts`, `calendar.ts`)
2. Implement all functions with proper TypeScript types
3. Add comprehensive error handling
4. Test each function with mock data
5. Integrate with React Query in components
6. Add loading states and error boundaries
