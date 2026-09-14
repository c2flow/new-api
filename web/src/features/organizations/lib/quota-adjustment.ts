import { z } from 'zod'

import { parseQuotaFromDollars } from '@/lib/format'

export const quotaAdjustmentSchema = z
  .object({
    mode: z.enum(['add', 'subtract', 'override']),
    amount: z
      .string()
      .trim()
      .min(1)
      .refine((value) => Number.isFinite(Number(value))),
    reason: z
      .string()
      .trim()
      .min(1)
      .refine((value) => new TextEncoder().encode(value).length <= 256),
  })
  .superRefine((values, context) => {
    const value = parseQuotaFromDollars(Number(values.amount))
    if (
      !Number.isSafeInteger(value) ||
      (values.mode !== 'override' && value <= 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Invalid amount',
      })
    }
  })
