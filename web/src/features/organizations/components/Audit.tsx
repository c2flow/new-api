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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { getOrganizationAudit } from '../api'
import { useOrganization } from '../context'

export function Audit() {
  const { t } = useTranslation()
  const context = useOrganization()
  const [page, setPage] = useState(1)
  const actions: Record<string, string> = {
    'organization.create': t('Create organization'),
    'request.failed': t('Request failed'),
    'organization.status': t('Organization status'),
    'platform.status': t('Organization status'),
    'member.invite': t('Invite member'),
    'member.accept': t('Accept invitation'),
    'member.decline': t('Decline invitation'),
    'member.update': t('Edit member'),
    'member.budget': t('Member spending limit'),
    'invite.revoke': t('Revoke invitation'),
    'invite.resend': t('Resend invitation'),
    'settings.update': t('Organization settings'),
    'ownership.request': t('Transfer ownership'),
    'ownership.accept': t('Accept ownership'),
    'token.create': t('Create API key'),
    'token.update': t('Edit API key'),
    'token.delete': t('Delete API key'),
  }
  const audit = useQuery({
    queryKey: ['organization-audit', context?.organization.id, page],
    queryFn: () => getOrganizationAudit(page),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Organization audit')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Time')}</TableHead>
              <TableHead>{t('Actor')}</TableHead>
              <TableHead>{t('Action')}</TableHead>
              <TableHead>{t('Object')}</TableHead>
              <TableHead>{t('Result')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(audit.data?.items ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {new Date(row.created_at * 1000).toLocaleString()}
                </TableCell>
                <TableCell>#{row.actor_id}</TableCell>
                <TableCell>{actions[row.action] ?? row.action}</TableCell>
                <TableCell>{row.object_id}</TableCell>
                <TableCell>
                  {row.result === 'success' ? t('Success') : t('Failed')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className='mt-4 flex justify-end gap-2'>
          <Button
            variant='outline'
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t('Previous')}
          </Button>
          <Button
            variant='outline'
            disabled={page * 20 >= (audit.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
