import { describe, expect, it } from 'vitest'
import { billingNeedsAttention, creditHealth, creditHealthRank } from '@/lib/creditHealth'

describe('creditHealth', () => {
  it('reads the balance against the allowance, not against itself', () => {
    // The same 40 credits, twice, meaning two different things.
    expect(creditHealth(40, 100).level).toBe('ok')
    expect(creditHealth(40, 500).level).toBe('critical')
  })

  it('calls an empty balance what it is', () => {
    expect(creditHealth(0, 100).level).toBe('empty')
    expect(creditHealth(-5, 100).level).toBe('empty')
  })

  it('separates nearly out from running low', () => {
    expect(creditHealth(10, 100).level).toBe('critical')
    expect(creditHealth(25, 100).level).toBe('low')
    expect(creditHealth(26, 100).level).toBe('ok')
  })

  // Without an allowance there is nothing to be a fraction of.
  it('only asks whether anything is left when there is no allowance', () => {
    expect(creditHealth(5, 0).level).toBe('ok')
    expect(creditHealth(0, 0).level).toBe('empty')
  })

  it('ranks worst first, because that is the point of the list', () => {
    const order = ['ok', 'low', 'critical', 'empty'] as const
    const sorted = [...order].sort((a, b) => creditHealthRank(a) - creditHealthRank(b))
    expect(sorted).toEqual(['empty', 'critical', 'low', 'ok'])
  })
})

describe('billingNeedsAttention', () => {
  // A workspace can be fully funded and still have a failed card.
  it('flags the statuses where money is not arriving', () => {
    for (const status of ['past_due', 'paused', 'canceled', 'unpaid']) {
      expect(billingNeedsAttention(status)).toBe(true)
    }
  })

  it('leaves the healthy ones alone', () => {
    for (const status of ['active', 'trialing', 'comped']) {
      expect(billingNeedsAttention(status)).toBe(false)
    }
  })
})
