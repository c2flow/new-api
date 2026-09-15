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
  const amount = z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isFinite(Number(value)) &&
          Number(value) >= 0 &&
          Number.isSafeInteger(Math.round(Number(value) * unit)) &&
          (Number(value) === 0 || Math.round(Number(value) * unit) > 0))
    )
  const schema = z.object({ spend_limit: amount, monthly_spend_limit: amount })
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      spend_limit: batch
        ? ''
        : String((props.members[0].spend_limit ?? 0) / unit),
      monthly_spend_limit: batch
        ? ''
        : String((props.members[0].monthly_spend_limit ?? 0) / unit),
    },
    mode: 'onChange',
  })
  const values = form.watch()
  const changes = Object.fromEntries(
    fields
      .filter(
        (field) =>
          values[field].trim() !== '' &&
          (batch ||
            Math.round(Number(values[field]) * unit) !==
              (props.members[0][field] ?? 0))
      )
      .map((field) => [field, Math.round(Number(values[field]) * unit)])
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
            {t('Leave blank to keep unchanged. Enter 0 for unlimited.')}
          </p>
          {fields.map((field) => (
            <Field key={field} data-invalid={!!form.formState.errors[field]}>
              <FieldLabel htmlFor={field}>
                {labels[field]} ({getCurrencyLabel()})
              </FieldLabel>
              <Input
                id={field}
                type='number'
                min='0'
                step='any'
                disabled={mutation.isPending}
                placeholder={t('Keep unchanged')}
                aria-invalid={!!form.formState.errors[field]}
                {...form.register(field)}
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
