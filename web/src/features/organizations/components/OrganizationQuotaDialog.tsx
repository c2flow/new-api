import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { api } from '@/lib/api'
import { getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'

import { quotaAdjustmentSchema } from '../lib/quota-adjustment'
import type { PlatformOrganization } from '../types'

export function OrganizationQuotaDialog(props: {
  organization: PlatformOrganization
  close: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const form = useForm<z.infer<typeof quotaAdjustmentSchema>>({
    resolver: zodResolver(quotaAdjustmentSchema),
    defaultValues: { mode: 'add', amount: '', reason: '' },
    mode: 'onChange',
  })
  const values = form.watch()
  const amount = parseQuotaFromDollars(Number(values.amount))
  let nextQuota = amount
  if (values.mode === 'add') nextQuota = props.organization.quota + amount
  if (values.mode === 'subtract') nextQuota = props.organization.quota - amount
  const mutation = useMutation({
    mutationFn: async (input: z.infer<typeof quotaAdjustmentSchema>) => {
      const response = await api.put<{ success: boolean; message?: string }>(
        `/api/platform/organizations/${props.organization.id}/quota`,
        {
          mode: input.mode,
          value: parseQuotaFromDollars(Number(input.amount)),
          reason: input.reason,
        }
      )
      if (!response.data.success) {
        throw new Error(response.data.message || t('Failed to adjust quota'))
      }
    },
    onSuccess: () => {
      toast.success(t('Quota adjusted successfully'))
      void client.invalidateQueries({ queryKey: ['platform-organizations'] })
      void client.invalidateQueries({
        queryKey: ['platform-organization-resources', props.organization.id],
      })
      props.close()
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.close()
      }}
      title={t('Adjust Quota')}
      description={props.organization.name}
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
            form='organization-quota-form'
            disabled={
              !form.formState.isValid ||
              !Number.isSafeInteger(nextQuota) ||
              mutation.isPending
            }
          >
            {mutation.isPending ? t('Processing...') : t('Confirm')}
          </Button>
        </>
      }
    >
      <form
        id='organization-quota-form'
        onSubmit={form.handleSubmit((input) => {
          if (mutation.isPending) return
          if (!Number.isSafeInteger(nextQuota)) {
            form.setError('amount', { type: 'validate' })
            return
          }
          mutation.mutate(input)
        })}
      >
        <FieldGroup>
          <p>
            {t('Current quota')}: {formatQuota(props.organization.quota)} →{' '}
            {Number.isSafeInteger(nextQuota) ? formatQuota(nextQuota) : '—'}
          </p>
          <Field>
            <FieldLabel htmlFor='organization-quota-mode'>
              {t('Mode')}
            </FieldLabel>
            <NativeSelect
              id='organization-quota-mode'
              disabled={mutation.isPending}
              {...form.register('mode')}
            >
              <NativeSelectOption value='add'>{t('Add')}</NativeSelectOption>
              <NativeSelectOption value='subtract'>
                {t('Subtract')}
              </NativeSelectOption>
              <NativeSelectOption value='override'>
                {t('Override')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field data-invalid={!!form.formState.errors.amount}>
            <FieldLabel htmlFor='organization-quota-amount'>
              {t('Amount')} ({getCurrencyLabel()})
            </FieldLabel>
            <Input
              id='organization-quota-amount'
              type='number'
              step='any'
              disabled={mutation.isPending}
              aria-invalid={!!form.formState.errors.amount}
              {...form.register('amount')}
            />
          </Field>
          <Field data-invalid={!!form.formState.errors.reason}>
            <FieldLabel htmlFor='organization-quota-reason'>
              {t('Reason')}
            </FieldLabel>
            <Input
              id='organization-quota-reason'
              disabled={mutation.isPending}
              aria-invalid={!!form.formState.errors.reason}
              {...form.register('reason')}
            />
          </Field>
          {mutation.isError && (
            <p role='alert'>{t('Failed to adjust quota')}</p>
          )}
        </FieldGroup>
      </form>
    </Dialog>
  )
}
