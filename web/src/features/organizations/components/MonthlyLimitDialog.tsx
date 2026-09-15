import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'

import { organizationMutation } from '../api'
import type { OrganizationMember } from '../types'

export function MonthlyLimitDialog(props: {
  members: OrganizationMember[]
  close: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const unit = getCurrencyDisplay().config.quotaPerUnit
  const schema = z.object({
    amount: z
      .number()
      .min(0)
      .refine(
        (amount) =>
          Number.isSafeInteger(Math.round(amount * unit)) &&
          (amount === 0 || Math.round(amount * unit) > 0)
      ),
  })
  const initial =
    props.members.length === 1 ? (props.members[0].monthly_spend_limit ?? 0) : 0
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: initial / unit,
    },
    mode: 'onChange',
  })
  const mutation = useMutation({
    mutationFn: (input: z.infer<typeof schema>) =>
      organizationMutation('put', 'members/monthly-limit', {
        user_ids: props.members.map((member) => member.user_id),
        monthly_spend_limit: Math.round(input.amount * unit),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['organization-members'] })
      props.close()
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.close()
      }}
      title={t('Monthly spending limit')}
      description={t('Apply to {{count}} selected members.', {
        count: props.members.length,
      })}
      contentHeight='auto'
      footer={
        <>
          <Button
            variant='outline'
            disabled={mutation.isPending}
            onClick={props.close}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='monthly-limit-form'
            disabled={!form.formState.isValid || mutation.isPending}
          >
            {t('Confirm')}
          </Button>
        </>
      }
    >
      <form
        id='monthly-limit-form'
        onSubmit={form.handleSubmit((input) => {
          if (!mutation.isPending) mutation.mutate(input)
        })}
      >
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.amount}>
            <FieldLabel htmlFor='monthly-amount'>
              {t('Monthly spending limit')} ({getCurrencyLabel()})
            </FieldLabel>
            <Input
              id='monthly-amount'
              type='number'
              min='0'
              step='any'
              disabled={mutation.isPending}
              aria-invalid={!!form.formState.errors.amount}
              {...form.register('amount', { valueAsNumber: true })}
            />
            <FieldDescription>
              {t(
                'Zero means unlimited. This limit does not reserve money from the shared pool.'
              )}{' '}
              {t(
                'Resets on the first day of each month at 00:00 Beijing time.'
              )}
            </FieldDescription>
          </Field>
          <p className='text-muted-foreground text-sm'>
            {t(
              'This replaces each selected member’s monthly limit immediately. Usage already incurred this month is retained.'
            )}
          </p>
          {mutation.isError && <p role='alert'>{t('Request failed')}</p>}
        </FieldGroup>
      </form>
    </Dialog>
  )
}
