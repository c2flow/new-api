import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
  const schema = z
    .object({ enabled: z.enum(['yes', 'no']), amount: z.string() })
    .refine(
      (input) =>
        input.enabled === 'no' ||
        (Number.isFinite(Number(input.amount)) &&
          Number(input.amount) > 0 &&
          Number.isSafeInteger(Math.round(Number(input.amount) * unit)) &&
          Math.round(Number(input.amount) * unit) > 0),
      { path: ['amount'] }
    )
  const initial =
    props.members.length === 1 ? (props.members[0].monthly_spend_limit ?? 0) : 0
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: initial > 0 ? 'yes' : 'no',
      amount: initial > 0 ? String(initial / unit) : '',
    },
    mode: 'onChange',
  })
  const enabled = form.watch('enabled') === 'yes'
  const mutation = useMutation({
    mutationFn: (input: z.infer<typeof schema>) =>
      organizationMutation('put', 'members/monthly-limit', {
        user_ids: props.members.map((member) => member.user_id),
        monthly_spend_limit:
          input.enabled === 'yes' ? Math.round(Number(input.amount) * unit) : 0,
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
          <p className='text-muted-foreground text-sm'>
            {t(
              'Optional additional cap. Resets on the first day of each month at 00:00 Beijing time. Existing budgets and subscriptions are unchanged.'
            )}
          </p>
          <Field>
            <FieldLabel htmlFor='monthly-enabled'>
              {t('Monthly spending limit')}
            </FieldLabel>
            <NativeSelect
              id='monthly-enabled'
              disabled={mutation.isPending}
              {...form.register('enabled')}
            >
              <NativeSelectOption value='no'>
                {t('Unlimited')}
              </NativeSelectOption>
              <NativeSelectOption value='yes'>
                {t('Set monthly limit')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          {enabled && (
            <Field data-invalid={!!form.formState.errors.amount}>
              <FieldLabel htmlFor='monthly-amount'>
                {t('Amount')} ({getCurrencyLabel()})
              </FieldLabel>
              <Input
                id='monthly-amount'
                type='number'
                min='0'
                step='any'
                disabled={mutation.isPending}
                aria-invalid={!!form.formState.errors.amount}
                {...form.register('amount')}
              />
            </Field>
          )}
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
