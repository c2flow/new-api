/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { parseQuotaFromDollars, quotaUnitsToEditableAmount } from '@/lib/format'

import type { PlatformOrganization, PlatformOrganizationMember } from '../types'

export function PlatformMemberDialog(props: {
  organization: PlatformOrganization
  member?: PlatformOrganizationMember
  close: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [username, setUsername] = useState(props.member?.username ?? '')
  const [role, setRole] = useState<'admin' | 'member'>(
    props.member?.role === 'admin' ? 'admin' : 'member'
  )
  const [status, setStatus] = useState(props.member?.status ?? 1)
  const [spendLimit, setSpendLimit] = useState(
    props.member?.spend_limit == null
      ? ''
      : String(quotaUnitsToEditableAmount(props.member.spend_limit))
  )
  const [monthlySpendLimit, setMonthlySpendLimit] = useState(
    props.member?.monthly_spend_limit == null
      ? ''
      : String(quotaUnitsToEditableAmount(props.member.monthly_spend_limit))
  )
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        role,
        status,
        spend_limit:
          spendLimit.trim() === ''
            ? null
            : parseQuotaFromDollars(Number(spendLimit)),
        monthly_spend_limit:
          monthlySpendLimit.trim() === ''
            ? null
            : parseQuotaFromDollars(Number(monthlySpendLimit)),
        reason: reason.trim(),
      }
      if (!props.member) {
        const response = await api.post<{ success: boolean; message?: string }>(
          `/api/platform/organizations/${props.organization.id}/members`,
          { ...payload, username: username.trim() }
        )
        if (!response.data.success) {
          throw new Error(response.data.message || t('Request failed'))
        }
        return
      }
      const response = await api.put<{
        success: boolean
        message?: string
      }>(
        `/api/platform/organizations/${props.organization.id}/members/${props.member.user_id}`,
        payload
      )
      if (!response.data.success) {
        throw new Error(response.data.message || t('Request failed'))
      }
    },
    onSuccess: () => {
      toast.success(props.member ? t('Member updated') : t('Member added'))
      void client.invalidateQueries({
        queryKey: [
          'platform-organization-resources',
          props.organization.id,
          'members',
        ],
      })
      props.close()
    },
  })
  const totalQuota = parseQuotaFromDollars(Number(spendLimit || 0))
  const monthlyQuota = parseQuotaFromDollars(Number(monthlySpendLimit || 0))
  const valid =
    (props.member !== undefined || username.trim().length > 0) &&
    username.trim().length <= 20 &&
    reason.trim().length > 0 &&
    reason.trim().length <= 256 &&
    Number.isSafeInteger(totalQuota) &&
    Number.isSafeInteger(monthlyQuota) &&
    totalQuota >= 0 &&
    monthlyQuota >= 0 &&
    (props.member !== undefined || confirmed)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.close()
      }}
      title={props.member ? t('Edit member') : t('Add member')}
      description={`${props.organization.name} (#${props.organization.id})`}
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
            form='platform-organization-member-form'
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending ? t('Processing...') : t('Confirm')}
          </Button>
        </>
      }
    >
      <form
        id='platform-organization-member-form'
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !mutation.isPending) mutation.mutate()
        }}
      >
        <FieldGroup>
          {!props.member && (
            <Alert variant='destructive'>
              <AlertTitle>{t('Break-glass platform action')}</AlertTitle>
              <AlertDescription>
                {t(
                  'The user joins immediately without accepting an invitation. This action is recorded in the organization audit log.'
                )}
              </AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor='platform-member-username'>
              {t('Username')}
            </FieldLabel>
            <Input
              id='platform-member-username'
              value={username}
              maxLength={20}
              disabled={mutation.isPending || props.member !== undefined}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='platform-member-role'>{t('Role')}</FieldLabel>
            <NativeSelect
              id='platform-member-role'
              value={role}
              disabled={mutation.isPending}
              onChange={(event) =>
                setRole(event.target.value as 'admin' | 'member')
              }
            >
              <NativeSelectOption value='member'>
                {t('Member')}
              </NativeSelectOption>
              <NativeSelectOption value='admin'>
                {t('Admin')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          {props.member && (
            <Field>
              <FieldLabel htmlFor='platform-member-status'>
                {t('Status')}
              </FieldLabel>
              <NativeSelect
                id='platform-member-status'
                value={String(status)}
                disabled={mutation.isPending}
                onChange={(event) => setStatus(Number(event.target.value))}
              >
                <NativeSelectOption value='1'>{t('Active')}</NativeSelectOption>
                <NativeSelectOption value='2'>
                  {t('Disabled')}
                </NativeSelectOption>
                <NativeSelectOption value='3'>{t('Remove')}</NativeSelectOption>
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor='platform-member-total-limit'>
              {t('Total spending limit')}
            </FieldLabel>
            <Input
              id='platform-member-total-limit'
              type='number'
              min='0'
              step='any'
              value={spendLimit}
              disabled={mutation.isPending}
              onChange={(event) => setSpendLimit(event.target.value)}
            />
            <FieldDescription>
              {t('Leave empty for unlimited. Enter 0 to block spending.')}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='platform-member-monthly-limit'>
              {t('Monthly spending limit')}
            </FieldLabel>
            <Input
              id='platform-member-monthly-limit'
              type='number'
              min='0'
              step='any'
              value={monthlySpendLimit}
              disabled={mutation.isPending}
              onChange={(event) => setMonthlySpendLimit(event.target.value)}
            />
            <FieldDescription>
              {t('Leave empty for unlimited. Enter 0 to block spending.')}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='platform-member-reason'>
              {t('Reason')}
            </FieldLabel>
            <Textarea
              id='platform-member-reason'
              value={reason}
              maxLength={256}
              disabled={mutation.isPending}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {!props.member && (
            <label className='flex items-start gap-3 text-sm'>
              <input
                type='checkbox'
                className='mt-1'
                checked={confirmed}
                disabled={mutation.isPending}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                {t(
                  'I confirm this consent bypass is authorized for account administration.'
                )}
              </span>
            </label>
          )}
          {mutation.isError && <p role='alert'>{mutation.error.message}</p>}
        </FieldGroup>
      </form>
    </Dialog>
  )
}
