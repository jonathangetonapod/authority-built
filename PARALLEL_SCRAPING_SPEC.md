# 🚀 Parallel Podcast Scraping Specification

## Overview

This document details the parallel processing implementation for scaling the podcast database from 2,500+ to 7,000-10,000+ podcasts efficiently.

---

## Problem Statement

### Initial Approach (Sequential)
- Fetched **1 page at a time** (50 podcasts per page)
- **1-2 second delay** between requests
- **Time to fetch 5,000 podcasts**: ~100 pages × 2s = **~3.3 minutes of API calls**
- **Risk**: Connection timeouts and rate limiting
- **Efficiency**: Low - only using 1 API connection at a time

### Issues Encountered
1. **Connection Resets**: `ECONNRESET` errors after ~1,000 requests
2. **Rate Limiting**: API throttling from sustained sequential requests
3. **Slow Progress**: Taking hours to fetch thousands of podcasts
4. **No Resilience**: Single failure stops entire process

---

## Solution: Parallel Processing

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Parallel Scraper                       │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │   Batch Controller                        │          │
│  │   - Manages page ranges                   │          │
│  │   - Controls concurrency                  │          │
│  └──────────────────────────────────────────┘          │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────────────────────────────┐          │
│  │   Parallel Fetch (5 concurrent requests) │          │
│  │                                           │          │
│  │   Page 1  →  [API]  ──┐                 │          │
│  │   Page 2  →  [API]  ──┤                 │          │
│  │   Page 3  →  [API]  ──┼──→  Results     │          │
│  │   Page 4  →  [API]  ──┤                 │          │
│  │   Page 5  →  [API]  ──┘                 │          │
│  └──────────────────────────────────────────┘          │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────────────────────────────┐          │
│  │   Deduplication & Validation              │          │
│  │   - Remove duplicates                     │          │
│  │   - Validate podcast data                 │          │
│  └──────────────────────────────────────────┘          │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────────────────────────────┐          │
│  │   Batch Database Insert (every 500)       │          │
│  │   - Upsert 100 at a time                  │          │
│  │   - Prevent memory overflow               │          │
│  └──────────────────────────────────────────┘          │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────────────────────────────┐          │
│  │   Progress Tracking                       │          │
│  │   - Count unique podcasts                 │          │
│  │   - Monitor empty batches                 │          │
│  │   - Track failures                        │          │
│  └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Concurrent Requests
```typescript
const CONCURRENT_REQUESTS = 5 // Fetch 5 pages simultaneously
```

**Benefits:**
- **5x faster** than sequential fetching
- Maximizes API throughput without overwhelming server
- Better utilization of network bandwidth

**Example:**
```
Sequential: Page 1 → Page 2 → Page 3 → Page 4 → Page 5 (10 seconds)
Parallel:   Pages 1-5 all at once (2 seconds)
```

### 2. Retry Logic
```typescript
async function searchPodcasts(page: number, retryCount: number = 0) {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 5000 // 5 seconds

  try {
    // Fetch page...
  } catch (error) {
    if (isConnectionError && retryCount < MAX_RETRIES) {
      await delay(RETRY_DELAY)
      return searchPodcasts(page, retryCount + 1)
    }
  }
}
```

**Handles:**
- Network timeouts
- Connection resets (`ECONNRESET`)
- Temporary API unavailability
- Transient failures

### 3. Graceful Failure Handling
```typescript
const results = await Promise.all(promises)

// Continue even if some requests fail
for (const result of results) {
  if (result === null) continue // Skip failed requests
  // Process successful results...
}
```

**Benefits:**
- Batch continues even if 1-2 pages fail
- Collects all successful data
- Logs failures for monitoring

### 4. Rate Limiting Between Batches
```typescript
const DELAY_BETWEEN_BATCHES = 3000 // 3 seconds

// After each batch of 5 concurrent requests
await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
```

**Prevents:**
- API rate limit violations
- Server overload
- Blacklisting from excessive requests

### 5. Memory Management
```typescript
// Save every 500 podcasts
if (allPodcasts.length >= 500) {
  await insertPodcasts(allPodcasts)
  allPodcasts = [] // Clear memory
}
```

**Prevents:**
- Memory overflow from storing thousands of objects
- Loss of data if script crashes
- Better progress visibility

### 6. Smart Termination
```typescript
let emptyBatchCount = 0
const MAX_EMPTY_BATCHES = 3

if (podcasts.length === 0) {
  emptyBatchCount++
  if (emptyBatchCount >= MAX_EMPTY_BATCHES) {
    console.log('Reached end of results')
    break
  }
}
```

**Detects:**
- End of available data
- API pagination limits
- Prevents infinite loops

---

## Performance Comparison

### Sequential Scraping
| Metric | Value |
|--------|-------|
| Pages per batch | 1 |
| Time per page | 2 seconds |
| Pages for 5,000 podcasts | 100 |
| Total time | ~3.3 minutes (API time only) |
| Resilience | Low (single point of failure) |

### Parallel Scraping
| Metric | Value |
|--------|-------|
| Pages per batch | 5 |
| Time per batch | 2 seconds (concurrent) |
| Batches for 5,000 podcasts | 20 |
| Delay between batches | 3 seconds |
| Total time | ~1.6 minutes (API time) |
| Resilience | High (failures isolated) |
| **Speedup** | **~2-3x faster** |

---

## Configuration Parameters

### Concurrency Settings
```typescript
CONCURRENT_REQUESTS = 5     // How many pages to fetch at once
                            // Recommended: 3-10
                            // Higher = faster but riskier

DELAY_BETWEEN_BATCHES = 3000 // Milliseconds to wait between batches
                             // Recommended: 2000-5000
                             // Lower = faster but may trigger rate limits
```

### Retry Settings
```typescript
MAX_RETRIES = 3             // How many times to retry failed requests
                            // Recommended: 3-5

RETRY_DELAY = 5000          // Milliseconds to wait before retry
                            // Recommended: 3000-10000
                            // Longer delays = better success rate
```

### Database Settings
```typescript
BATCH_SIZE = 100            // How many podcasts per DB insert
                            // Recommended: 50-200

SAVE_THRESHOLD = 500        // Save to DB every N podcasts collected
                            // Recommended: 250-1000
```

### Scraping Filters
```typescript
min_audience_size = 500     // Minimum podcast audience
                            // Original: 1500 → Lowered for more results

min_last_episode_posted_at  // Active in last N days
  = get180DaysAgo()         // Original: 100 days → Extended to 180

category_ids                // Categories to scrape
  = 40+ major categories    // Original: 20 → Expanded to 40+
```

---

## Data Flow

### 1. Fetch Phase
```
Batch 1: Pages 1-5   →  [API] → 250 podcasts (50/page × 5)
Wait 3s...
Batch 2: Pages 6-10  →  [API] → 250 podcasts
Wait 3s...
Batch 3: Pages 11-15 →  [API] → 250 podcasts
...
```

### 2. Processing Phase
```
Raw Podcasts (250)
  ↓
Filter Invalid (missing IDs, names)
  ↓
Deduplicate (check uniquePodcastIds Set)
  ↓
Map to Database Schema
  ↓
Valid Podcasts (~245)
```

### 3. Storage Phase
```
Accumulate podcasts in memory
  ↓
When count >= 500:
  ↓
Split into batches of 100
  ↓
Upsert to database (on conflict: podscan_id)
  ↓
Clear memory
```

---

## Error Handling Strategy

### Network Errors
```typescript
try {
  const response = await fetch(...)
} catch (error) {
  if (error.includes('ECONNRESET') && retryCount < MAX_RETRIES) {
    // Wait and retry
    await delay(RETRY_DELAY)
    return searchPodcasts(page, retryCount + 1)
  }
  // Log and continue with other pages
  return null
}
```

### Database Errors
```typescript
try {
  await supabase.from('podcasts').upsert(batch)
} catch (error) {
  console.error('Database error:', error)
  throw error // Critical - stop execution
}
```

### Partial Batch Failures
```typescript
// Promise.all with null fallback
const results = await Promise.all(
  promises.map(p => p.catch(() => null))
)

// Filter out null results
const validResults = results.filter(r => r !== null)
```

---

## Monitoring & Logging

### Progress Indicators
```
🔄 Fetching pages 1-5 in parallel...
   ✅ 5/5 pages succeeded, 0 empty, fetched 250 podcasts
   📈 Progress: 250/7,000 unique podcasts
   ⏸️  Waiting 3s before next batch...

🔄 Fetching pages 6-10 in parallel...
   ✅ 4/5 pages succeeded, 0 empty, fetched 200 podcasts
   ⚠️  Page 8 - Connection error. Retry 1/3 in 5s...
   📈 Progress: 450/7,000 unique podcasts
```

### Error Tracking
```
   ❌ Page 15 failed after 3 retries: ECONNRESET
   ⚠️  Empty batch 1/3
   🛑 Multiple empty batches - reached end of results
```

---

## Expected Results

### Database Growth Projection

| Phase | Podcasts | Cumulative | Time |
|-------|----------|------------|------|
| **Current** | 2,509 | 2,509 | - |
| **Batch 1-10** | +500 | 3,009 | ~30s |
| **Batch 11-20** | +500 | 3,509 | ~60s |
| **Batch 21-40** | +1,000 | 4,509 | ~2min |
| **Batch 41-80** | +2,000 | 6,509 | ~4min |
| **Batch 81-120** | +2,000 | 8,509 | ~6min |
| **Target** | - | **8,000-10,000** | **~8-10 min** |

### Category Distribution (Projected)
- **Culture**: 679 → ~1,200
- **Society**: 675 → ~1,200
- **Business**: 569 → ~900
- **News**: 531 → ~900
- **Comedy**: 391 → ~700
- **Education**: 327 → ~600
- **Technology**: 269 → ~500
- Plus 30+ other categories growing proportionally

---

## Post-Scraping: Embedding Generation

After expanding to 8,000-10,000 podcasts, embeddings must be generated for new podcasts.

### Embedding Script
```bash
npx tsx scripts/generate-podcast-embeddings.ts
```

### Process
1. Fetch podcasts where `embedding IS NULL`
2. Generate embeddings for ~5,000-7,000 new podcasts
3. Cost: ~5,000 × 200 tokens = 1M tokens = **$0.02**
4. Time: ~5,000 podcasts ÷ 50 per batch = 100 batches × 30s = **~50 minutes**

### Migration for New Podcasts
```sql
-- Find podcasts without embeddings
SELECT COUNT(*)
FROM podcasts
WHERE embedding IS NULL;

-- Embeddings will be generated and stored automatically
```

---

## Usage

### Run Parallel Scraper
```bash
cd "/Users/jonathangarces/Desktop/GOAP -> Authority Lab/getonapod-app"
npx tsx scripts/scrape-parallel.ts
```

### Monitor Progress
Watch console output for:
- Batch progress
- Success/failure rates
- Total podcast count
- ETA to target

### Verify Results
```bash
npx tsx scripts/check-podcast-count.ts
npx tsx scripts/count-by-category.ts
```

---

## Advantages Over Sequential

1. **Speed**: 2-3x faster execution
2. **Resilience**: Isolated failures don't stop progress
3. **Efficiency**: Better API utilization
4. **Scalability**: Can increase concurrency if needed
5. **Monitoring**: Better visibility into batch progress
6. **Recovery**: Auto-saves progress every 500 podcasts
7. **Termination**: Smart detection of pagination end

---

## Future Optimizations

1. **Dynamic Concurrency**: Adjust based on success rates
2. **Priority Queuing**: Fetch high-value categories first
3. **Incremental Updates**: Only fetch new podcasts since last run
4. **Distributed Scraping**: Split categories across multiple processes
5. **Caching**: Store API responses temporarily to avoid re-fetching
6. **Rate Limit Detection**: Auto-throttle on 429 responses

---

## Files

### Scripts
- `scripts/scrape-parallel.ts` - Parallel scraping implementation
- `scripts/scrape-maximum-coverage.ts` - Sequential with retries (fallback)
- `scripts/generate-podcast-embeddings.ts` - Generate embeddings post-scrape
- `scripts/check-podcast-count.ts` - Verify database count
- `scripts/count-by-category.ts` - Analyze category distribution

### Documentation
- `PARALLEL_SCRAPING_SPEC.md` - This file
- `PODCAST_DATABASE_EXPANSION_JAN_29_2026.md` - Initial expansion docs
- `EMBEDDING_SETUP.md` - Embedding generation guide

---

## Success Criteria

- ✅ Fetch 5,000-7,000+ new podcasts
- ✅ No data loss from failures
- ✅ Complete in under 15 minutes
- ✅ <5% request failure rate
- ✅ All podcasts deduplicated
- ✅ Database integrity maintained
- ✅ Ready for embedding generation

---

**Last Updated**: January 30, 2026
**Status**: Ready for execution
**Estimated Completion**: 8-12 minutes for 7,000 podcasts
