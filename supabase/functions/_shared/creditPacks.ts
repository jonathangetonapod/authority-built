/**
 * What a top-up costs, in one place.
 *
 * These lived in the checkout function, which was the only thing that needed
 * them until automatic refills arrived. Importing them from there would have
 * executed that function's serve() as a side effect of reading a constant, so
 * the constant moved out rather than the importer working around it.
 *
 * One ladder with the plan, which includes 100 credits for $29 ($0.29 each).
 * Buying more must never cost more per credit than subscribing, or the packs
 * are a penalty for needing them. The previous set charged $0.98/credit on the
 * entry pack while a second, unwired card on the billing page advertised
 * $0.39 — a customer comparing the two saw the cheaper one that did nothing.
 */
export const CREDIT_PACKS = {
  starter: { credits: 100, amount_cents: 2_900, label: 'Top-up · 100 credits' },
  growth: { credits: 300, amount_cents: 6_900, label: 'Growth · 300 credits' },
  scale: { credits: 800, amount_cents: 14_900, label: 'Scale · 800 credits' },
} as const

export type CreditPackKey = keyof typeof CREDIT_PACKS
