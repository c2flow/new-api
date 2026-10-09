import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'

import { organizationMutation } from '../api'
import type { OrganizationMember } from '../types'

export function MemberLimitsDialog(props: {
  members: OrganizationMember[]
  batch?: boolean
  close: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const unit = getCurrencyDisplay().config.quotaPerUnit
  const batch = props.batch ?? props.members.length > 1
  const fields = ['spend_limit', 'monthly_spend_limit'] as const
  const labels = {
    spend_limit: t('Total spending limit'),
    monthly_spend_limit: t('Monthly spending limit'),
  }
  const limit = z
    .object({
      mode: z.enum(['unchanged', 'unlimited', 'limited']),
      amount: z.string(),
    })
    .superRefine((value, context) => {
      if (value.mode !== 'limited') return
      const amount = Number(value.amount)
      const quota = Math.round(amount * unit)
      if (
        value.amount.trim() === '' ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        !Number.isSafeInteger(quota) ||
        (amount > 0 && quota === 0)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['amount'],
          message: t('Invalid amount'),
        })
      }
    })
  const schema = z.object({ spend_limit: limit, monthly_spend_limit: limit })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
      fields.map((field) => {
        let mode: z.infer<typeof limit>['mode'] = 'limited'
        if (props.members[0][field] === null) mode = 'unlimited'
        if (batch) mode = 'unchanged'
        return [
          field,
          { mode, amount: String((props.members[0][field] ?? 0) / unit) },
        ]
      })
    ),
    mode: 'onChange',
  })
  const [total, monthly] = useWatch({
    control: form.control,
    name: ['spend_limit', 'monthly_spend_limit'],
  })
  const values = { spend_limit: total, monthly_spend_limit: monthly }
  const changes = Object.fromEntries(
    fields
      .filter((field) => values[field].mode !== 'unchanged')
      .map(
        (field) =>
          [
            field,
            values[field].mode === 'unlimited'
              ? null
              : Math.round(Number(values[field].amount) * unit),
          ] as const
      )
      .filter(([field, value]) => batch || value !== props.members[0][field])
  )
  const mutation = useMutation({
    mutationFn: () =>
      organizationMutation('put', 'members/limits', {
        user_ids: props.members.map((member) => member.user_id),
        ...changes,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['organization-members'] })
      void client.invalidateQueries({ queryKey: ['organization-summary'] })
      props.close()
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.close()
      }}
      title={
        batch ? t('Batch edit spending limits') : t('Edit spending limits')
      }
      description={
        batch
          ? t('Apply to {{count}} selected members.', {
              count: props.members.length,
            })
          : props.members[0].display_name || props.members[0].username
      }
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
            form='member-limits-form'
            disabled={
              !form.formState.isValid ||
              Object.keys(changes).length === 0 ||
              mutation.isPending
            }
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <form
        id='member-limits-form'
        onSubmit={form.handleSubmit(() => {
          if (!mutation.isPending && Object.keys(changes).length > 0) {
            mutation.mutate()
          }
        })}
      >
        <FieldGroup>
          <p className='text-muted-foreground text-sm'>
            {t('Choose unlimited or set a limit. Enter 0 to block spending.')}
          </p>
          {fields.map((field) => (
            <Field key={field} data-invalid={!!form.formState.errors[field]}>
              <FieldLabel htmlFor={field}>
                {labels[field]} ({getCurrencyLabel()})
              </FieldLabel>
              <NativeSelect
                aria-label={`${labels[field]} ${t('Limit mode')}`}
                value={values[field].mode}
                disabled={mutation.isPending}
                onChange={(event) =>
                  form.setValue(
                    `${field}.mode`,
                    event.target.value as z.infer<typeof limit>['mode'],
                    { shouldValidate: true }
                  )
                }
              >
                {batch && (
                  <NativeSelectOption value='unchanged'>
                    {t('Keep unchanged')}
                  </NativeSelectOption>
                )}
                <NativeSelectOption value='unlimited'>
                  {t('Unlimited')}
                </NativeSelectOption>
                <NativeSelectOption value='limited'>
                  {t('Set spending limit')}
                </NativeSelectOption>
              </NativeSelect>
              <Input
                id={field}
                type='number'
                min='0'
                step='any'
                disabled={
                  mutation.isPending || values[field].mode !== 'limited'
                }
                value={
                  values[field].mode === 'limited' ? values[field].amount : ''
                }
                placeholder={
                  values[field].mode === 'unlimited'
                    ? t('Unlimited')
                    : t('Keep unchanged')
                }
                aria-invalid={!!form.formState.errors[field]}
                onChange={(event) =>
                  form.setValue(`${field}.amount`, event.target.value, {
                    shouldValidate: true,
                  })
                }
              />
              <FieldDescription>
                {field === 'spend_limit'
                  ? t(
                      'Counts all spending in this organization. Does not reset.'
                    )
                  : t(
                      'Resets on the first day of each month at 00:00 Beijing time.'
                    )}
              </FieldDescription>
            </Field>
          ))}
          <p className='text-muted-foreground text-sm'>
            {t(
              'Only specified limits are changed. Existing spending is retained.'
            )}
          </p>
          {mutation.isError && <p role='alert'>{t('Request failed')}</p>}
        </FieldGroup>
      </form>
    </Dialog>
  )
}
