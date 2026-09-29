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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Building2, Users, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuotaWithCurrency } from '@/lib/currency'

import {
  getOrganizationSummary,
  getPlatformOrganizationSummary,
  organizationMutation,
} from '../api'
import { useOrganization } from '../context'
import { usePlatformView } from '../platform-view'

export function OrganizationSummary(props: {
  platformOrganization?: { id: number; name: string }
  hideOwnerAndPersonalQuota?: boolean
}) {
  const { t } = useTranslation()
  const context = useOrganization()
  const client = useQueryClient()
  const [confirmTransfer, setConfirmTransfer] = useState(false)
  const accept = useMutation({
    mutationFn: () => organizationMutation('post', 'transfer/accept'),
    onSuccess: () => {
      setConfirmTransfer(false)
      void client.invalidateQueries({ queryKey: ['organization-context'] })
      void client.invalidateQueries({ queryKey: ['organization-members'] })
    },
  })
  const platform = usePlatformView()
  const platformOrganization = props.platformOrganization
  const summary = useQuery({
    queryKey: [
      'organization-summary',
      platformOrganization?.id ?? context?.organization.id,
    ],
    queryFn: () =>
      platformOrganization
        ? getPlatformOrganizationSummary(platformOrganization.id)
        : getOrganizationSummary(),
    enabled: platformOrganization != null || (!platform && context !== null),
  })
  if (platform && platformOrganization == null) {
    return (
      <div className='bg-muted/30 rounded-xl border px-4 py-3 text-sm'>
        {t('Platform administration')} ·{' '}
        {t('Global resources across organizations')}
      </div>
    )
  }
  if (context === null && platformOrganization == null) return null
  const data = summary.data
  const roleLabels = {
    owner: t('Owner'),
    admin: t('Admin'),
    member: t('Member'),
  }
  let roleLabel = ''
  if (platformOrganization) {
    roleLabel = roleLabels.owner
  } else if (context?.membership) {
    roleLabel = roleLabels[context.membership.role]
  }
  let totalRemainingLabel = ''
  let monthlyRemainingLabel = ''
  if (data) {
    totalRemainingLabel = data.total_limit_enabled
      ? formatQuotaWithCurrency(data.total_remaining_quota)
      : t('Unlimited')
    monthlyRemainingLabel = data.monthly_limit_enabled
      ? formatQuotaWithCurrency(data.monthly_remaining_quota)
      : t('Unlimited')
  }
  return (
    <div className='bg-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border px-5 py-4 shadow-xs'>
      <div className='flex min-w-0 items-center gap-3'>
        <span className='bg-primary/10 text-primary rounded-xl p-2'>
          {platformOrganization == null && context?.logo ? (
            <img
              src={context.logo}
              alt=''
              className='size-5 rounded object-contain'
            />
          ) : (
            <Building2 className='size-5' />
          )}
        </span>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <strong className='truncate'>
              {platformOrganization?.name ?? context?.organization.name}
            </strong>
            {!props.hideOwnerAndPersonalQuota && (
              <Badge variant='secondary'>{roleLabel}</Badge>
            )}
          </div>
          <span className='text-muted-foreground text-xs'>
            {t('Organization usage')}
          </span>
        </div>
      </div>
      {!props.hideOwnerAndPersonalQuota && (
        <div className='text-muted-foreground text-xs'>
          {t('Total remaining limit')}
          <strong className='text-foreground mt-1 block text-base'>
            {data ? totalRemainingLabel : <Skeleton className='h-5 w-20' />}
          </strong>
        </div>
      )}
      {!props.hideOwnerAndPersonalQuota && (
        <div className='text-muted-foreground text-xs'>
          {t('Monthly remaining limit')}
          <strong className='text-foreground mt-1 block text-base'>
            {data ? monthlyRemainingLabel : <Skeleton className='h-5 w-20' />}
          </strong>
        </div>
      )}
      {(platformOrganization != null ||
        context?.capabilities.org['org.billing']?.read === true) && (
        <div className='text-muted-foreground text-xs'>
          {t('Organization wallet')}
          <strong className='text-foreground mt-1 block text-base'>
            {data ? (
              formatQuotaWithCurrency(data.quota)
            ) : (
              <Skeleton className='h-5 w-20' />
            )}
          </strong>
        </div>
      )}
      {context?.pending_transfer && platformOrganization == null && (
        <>
          <Button variant='outline' onClick={() => setConfirmTransfer(true)}>
            {t('Accept ownership')}
          </Button>
          <Dialog
            open={confirmTransfer}
            onOpenChange={setConfirmTransfer}
            title={t('Accept ownership')}
            contentHeight='auto'
          >
            <p>
              {t(
                'You will become the owner of {{name}}. The current owner will become an administrator.',
                { name: context.organization.name }
              )}
            </p>
            <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
              {t('Confirm')}
            </Button>
          </Dialog>
        </>
      )}
      {platformOrganization == null && (
        <div className='ms-auto flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            render={
              <Link
                to='/organization/$section'
                params={{ section: 'members' }}
              />
            }
          >
            <Users />
            {t('Members')}
            {data && ` · ${data.member_count}`}
          </Button>
          <Button
            variant='outline'
            size='sm'
            render={
              <Link
                to='/organization/$section'
                params={{ section: 'billing' }}
              />
            }
          >
            <Wallet />
            {t('Wallet')}
          </Button>
        </div>
      )}
    </div>
  )
}
