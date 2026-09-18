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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatQuotaWithCurrency } from '@/lib/currency'

import { getOrganizationSummary } from '../api'
import { useOrganization } from '../context'

export function Billing() {
  const { t } = useTranslation()
  const context = useOrganization()
  const summary = useQuery({
    queryKey: ['organization-summary', context?.organization.id],
    queryFn: getOrganizationSummary,
  })
  const membersLink = (
    <Link
      to='/organization/$section'
      params={{ section: 'members' }}
      className={buttonVariants({
        variant: 'outline',
        className: 'self-start',
      })}
    >
      {context?.capabilities.org['org.member']?.write
        ? t('Manage member spending limits')
        : t('Members')}
    </Link>
  )
  const data = summary.data
  if (!data) return <p role='status'>{t('Loading...')}</p>
  if (!context?.capabilities.org['org.billing']?.read) {
    const own = data.usage.find(
      (row) => row.user_id === context?.membership.user_id
    )
    return (
      <div className='space-y-5'>
        <Card>
          <CardHeader>
            <CardTitle>{t('My remaining limit')}</CardTitle>
            <CardDescription>
              {formatQuotaWithCurrency(data.available_quota)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              {t('Total spending')}: {formatQuotaWithCurrency(data.used_quota)}
            </p>
            <p>
              {t('Pending reservations')}:{' '}
              {formatQuotaWithCurrency(own?.reserved ?? 0)}
            </p>
          </CardContent>
        </Card>
        {membersLink}
      </div>
    )
  }
  const used = data.usage.reduce((sum, row) => sum + row.used, 0)
  const reserved = data.usage.reduce((sum, row) => sum + row.reserved, 0)
  return (
    <div className='flex flex-col gap-5'>
      <Alert>
        <AlertDescription>
          {t(
            'Members share the organization balance. Spending limits do not allocate separate wallets.'
          )}
        </AlertDescription>
      </Alert>
      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardDescription>{t('Organization wallet')}</CardDescription>
            <CardTitle className='text-2xl'>
              {formatQuotaWithCurrency(data.quota)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {context?.capabilities.org['org.billing']?.write && (
              <p className='text-muted-foreground text-sm'>
                {t('Please contact the system administrator to top up.')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('Monthly usage')}</CardDescription>
            <CardTitle className='text-2xl'>
              {formatQuotaWithCurrency(used)}
            </CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground text-sm'>
            {t('Pending reservations')}: {formatQuotaWithCurrency(reserved)}
          </CardContent>
        </Card>
      </div>
      {membersLink}
    </div>
  )
}
