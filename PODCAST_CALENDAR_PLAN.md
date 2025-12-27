# Podcast Calendar Management System - Implementation Plan

## Current System Analysis

### Client Sheets (Individual)
- Podcast Name, URL, Description
- Ratings, Audience Size
- Acts as a "target list" or "booked list" per client

### Master Sheet (Overview)
- Client info (name, LinkedIn, calendar link, email, invoice date)
- Monthly calendar showing number of podcasts per month
- Links to each client's individual sheet

## Proposed Database Schema

### 1. `clients` Table
```sql
- id (uuid, primary key)
- name (text)
- linkedin_url (text)
- website (text)
- calendar_link (text)
- contact_person (text)
- email (text)
- first_invoice_paid_date (date)
- status (text: 'active', 'paused', 'churned')
- notes (text)
- created_at (timestamp)
- updated_at (timestamp)
```

### 2. `podcasts` Table (Master Podcast Database)
```sql
- id (uuid, primary key)
- name (text)
- url (text)
- description (text)
- ratings (integer)
- audience_size (integer)
- host_name (text)
- category (text)
- is_active (boolean)
- created_at (timestamp)
- updated_at (timestamp)
```

### 3. `client_podcast_bookings` Table (The Calendar)
```sql
- id (uuid, primary key)
- client_id (uuid, foreign key -> clients)
- podcast_id (uuid, foreign key -> podcasts)
- scheduled_date (date) - when appearance is scheduled
- status (text: 'scheduled', 'recorded', 'published', 'cancelled')
- recording_date (date)
- publish_date (date)
- episode_url (text)
- notes (text)
- prep_sent (boolean)
- created_at (timestamp)
- updated_at (timestamp)
```

## Proposed Features & UI

### 1. **Client Management** (`/admin/clients`)
**List View:**
- Table of all clients
- Columns: Name, Email, Status, Total Bookings, Last Booking, Actions
- Search/filter by name, status
- Quick actions: View, Edit, Add Booking

**Detail View:**
- Client info card (editable)
- Booking history table (all podcasts for this client)
- Monthly calendar showing their bookings
- Add new booking button
- Notes section

### 2. **Podcast Database** (`/admin/podcast-database`)
**List View:**
- Table of all podcasts (master list)
- Columns: Name, Audience Size, Ratings, Times Used, Actions
- Search/filter by name, audience size range
- Add new podcast button

**Detail View:**
- Podcast details (editable)
- List of clients who've been on this podcast
- Booking history

### 3. **Calendar Dashboard** (`/admin/calendar`)
**Monthly Grid View:**
- Rows: Clients
- Columns: Months (Jan-Dec 2025, etc.)
- Cells: Number of bookings per month (clickable)
- Filters: Year selector, client search
- Similar to your master sheet but interactive

**Timeline View:**
- Gantt-chart style view
- See all bookings across time
- Drag-and-drop to reschedule

### 4. **Bookings Management** (`/admin/bookings`)
**List View:**
- All bookings across all clients
- Filter by: Client, Status, Date range, Podcast
- Columns: Client, Podcast, Scheduled Date, Status, Actions
- Bulk actions (mark as recorded, published, etc.)

**Add/Edit Booking:**
- Modal/form with:
  - Select Client (dropdown)
  - Select Podcast (searchable dropdown or "Add New")
  - Scheduled Date (date picker)
  - Status dropdown
  - Recording Date, Publish Date
  - Notes

### 5. **Dashboard** (`/admin/dashboard`)
**Overview Stats:**
- Total clients
- Active bookings this month
- Total bookings this year
- Upcoming this week

**Quick Lists:**
- Upcoming recordings (next 7 days)
- Recently published
- Needs follow-up

**Monthly Chart:**
- Bar chart showing bookings per month
- Compare to previous months

## Key Improvements Over Spreadsheets

✅ **Single source of truth** - One podcast database shared across clients
✅ **Better search** - Find clients, podcasts, bookings instantly
✅ **Status tracking** - See what's scheduled vs recorded vs published
✅ **Timeline visibility** - See past and future at a glance
✅ **Less duplication** - Don't re-enter podcast details for each client
✅ **Better reporting** - Generate reports, export data easily
✅ **Mobile access** - Check calendar from anywhere
✅ **Notifications** - Could add reminders for upcoming recordings
✅ **Integration ready** - Could integrate with Google Calendar, etc.

## Implementation Phases

### Phase 1: Database & Basic CRUD (Week 1)
- Create database tables
- Migration scripts
- Basic client management (add, edit, list)
- Basic podcast database (add, edit, list)

### Phase 2: Booking System (Week 1-2)
- Create/edit bookings
- Assign podcast to client with date
- Status management
- Client detail page with booking history

### Phase 3: Calendar Views (Week 2)
- Monthly grid view (like master sheet)
- Timeline view
- Filtering and search

### Phase 4: Polish & Features (Week 3)
- Dashboard widgets
- Export functionality
- Bulk operations
- Import existing data from sheets

## Data Migration Plan

1. **Import Clients** from master sheet
2. **Import Podcasts** from all client sheets (deduplicated)
3. **Import Bookings** from master sheet monthly numbers
   - For each cell with a number > 0, create that many bookings
   - Distribute across the month (since exact dates unknown)

## Questions to Consider

1. **Do you need to track individual episodes**, or just "how many podcasts per month"?
2. **Should we track podcast pitch status** (pitched, accepted, rejected)?
3. **Do you need different views for different team members?**
4. **Any automations needed?** (emails, reminders, reports)
5. **Do you want to track revenue per booking?**
6. **Import all historical data or start fresh?**

---

## Next Steps

1. **Review this plan** - Does this match your vision?
2. **Answer questions** - Help me understand any missing requirements
3. **Approve phase 1** - I'll start with database schema and basic client management
4. **Iterate** - We'll build and refine as we go

What do you think? Should we proceed with this approach?
