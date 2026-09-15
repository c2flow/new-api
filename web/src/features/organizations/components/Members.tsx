import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatQuotaWithCurrency } from '@/lib/currency'

import {
  getOrganizationSummary,
  getOrganizationInvites,
  getOrganizationMembers,
  organizationMutation,
} from '../api'
import { useOrganization } from '../context'
import type { OrganizationMember } from '../types'
import { MemberDialog } from './MemberDialog'
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
import { MonthlyLimitDialog } from './MonthlyLimitDialog'

export function Members(props: { budgets?: boolean }) {
  const { t } = useTranslation()
  const context = useOrganization()
  const client = useQueryClient()
  const manage = context?.capabilities.org['org.member']?.write === true
  const team = context !== null
  const resend = useMutation({
    mutationFn: (id: number) =>
      organizationMutation('post', `invites/${id}/resend`),
    onSuccess: () => {
      toast.success(
        t('Invitation sent. The user can accept it in Notifications.')
      )
      void client.invalidateQueries({ queryKey: ['organization-invites'] })
    },
  })
  const [search, setSearch] = useState('')
  const [selectedIDs, setSelectedIDs] = useState<number[]>([])
  const [monthlyMembers, setMonthlyMembers] = useState<
    OrganizationMember[] | null
  >(null)
  const [dialog, setDialog] = useState<OrganizationMember | 'invite' | null>(
    null
  )
  const members = useQuery({
    queryKey: ['organization-members', context?.organization.id],
    queryFn: getOrganizationMembers,
  })
  const summary = useQuery({
    queryKey: ['organization-summary', context?.organization.id],
    queryFn: getOrganizationSummary,
    enabled: !!props.budgets,
  })
  const invites = useQuery({
    queryKey: ['organization-invites', context?.organization.id],
    queryFn: getOrganizationInvites,
    enabled: manage && team && !props.budgets,
  })
  const revoke = useMutation({
    mutationFn: (id: number) => organizationMutation('delete', `invites/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['organization-invites'] })
    },
  })
  const roleLabels = {
    owner: t('Owner'),
    admin: t('Admin'),
    member: t('Member'),
  }
  const inviteLabels = {
    pending: t('Pending'),
    accepted: t('Accepted'),
    expired: t('Expired'),
    revoked: t('Revoked'),
    declined: t('Declined'),
  }
  const filtered = (members.data ?? []).filter((member) =>
    `${member.email} ${member.username} ${member.display_name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  const selectedMembers = (members.data ?? []).filter(
    (member) => member.status === 1 && selectedIDs.includes(member.user_id)
  )
  const showMonthly = (members.data ?? []).some(
    (member) => (member.monthly_spend_limit ?? 0) > 0
  )
  if (members.isError) {
    return (
      <Button
        variant='outline'
        onClick={() => {
          void members.refetch()
        }}
      >
        {t('Retry')}
      </Button>
    )
  }
  return (
    <div className='flex flex-col gap-5'>
      {monthlyMembers && (
        <MonthlyLimitDialog
          members={monthlyMembers}
          close={() => {
            setMonthlyMembers(null)
            setSelectedIDs([])
          }}
        />
      )}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <InputGroup className='max-w-sm'>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t('Search members')}
            placeholder={t('Search members')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        {manage && team && !props.budgets && (
          <Button onClick={() => setDialog('invite')}>
            <UserPlus />
            {t('Invite member')}
          </Button>
        )}
      </div>
      {manage && selectedMembers.length > 0 && (
        <Button
          variant='outline'
          disabled={selectedMembers.length > 500}
          onClick={() => setMonthlyMembers(selectedMembers)}
        >
          {t('Set monthly limit')} ({selectedMembers.length})
        </Button>
      )}
      {manage && selectedMembers.length > 500 && (
        <p role='alert'>{t('Select up to 500 members per batch.')}</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {props.budgets ? t('Member spending limits') : t('Members')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.isPending ? (
            <Skeleton className='h-40 w-full' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {manage && (
                    <TableHead>
                      <Checkbox
                        aria-label={t('Select filtered members')}
                        checked={
                          filtered.some((m) => m.status === 1) &&
                          filtered
                            .filter((m) => m.status === 1)
                            .every((m) => selectedIDs.includes(m.user_id))
                        }
                        onCheckedChange={(checked) =>
                          setSelectedIDs(
                            checked
                              ? filtered
                                  .filter((m) => m.status === 1)
                                  .map((m) => m.user_id)
                              : []
                          )
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>{t('Member')}</TableHead>
                  <TableHead>{t('Role')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Billing-period spending limit')}</TableHead>
                  {showMonthly && (
                    <TableHead>
                      <span
                        title={t(
                          'Resets on the first day of each month at 00:00 Beijing time.'
                        )}
                        className='cursor-help border-b border-dotted'
                      >
                        {t('Monthly spending limit')}
                      </span>
                    </TableHead>
                  )}
                  {props.budgets && (
                    <>
                      <TableHead>{t('Current period usage')}</TableHead>
                      <TableHead>{t('Pending reservations')}</TableHead>
                    </>
                  )}
                  <TableHead className='text-end'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((member) => (
                  <TableRow key={member.id}>
                    {manage && (
                      <TableCell>
                        <Checkbox
                          aria-label={t('Select {{name}}', {
                            name: member.username,
                          })}
                          disabled={member.status !== 1}
                          checked={selectedIDs.includes(member.user_id)}
                          onCheckedChange={(checked) =>
                            setSelectedIDs((ids) =>
                              checked
                                ? [...ids, member.user_id]
                                : ids.filter((id) => id !== member.user_id)
                            )
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <strong>{member.display_name || member.username}</strong>
                      <p className='text-muted-foreground text-xs'>
                        {member.email}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant='secondary'>
                        {roleLabels[member.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.status === 1 ? t('Active') : t('Inactive')}
                    </TableCell>
                    <TableCell>
                      {member.spend_limit
                        ? formatQuotaWithCurrency(member.spend_limit)
                        : t('Unlimited')}
                    </TableCell>
                    {showMonthly && (
                      <TableCell>
                        {(member.monthly_spend_limit ?? 0) > 0 ? (
                          <>
                            <p>
                              {formatQuotaWithCurrency(
                                member.monthly_spend_limit ?? 0
                              )}
                            </p>
                            <p className='text-muted-foreground text-xs'>
                              {t('Remaining')}:{' '}
                              {formatQuotaWithCurrency(
                                Math.max(
                                  0,
                                  (member.monthly_spend_limit ?? 0) -
                                    (member.monthly_usage?.used ?? 0) -
                                    (member.monthly_usage?.reserved ?? 0)
                                )
                              )}
                            </p>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    )}
                    {props.budgets && (
                      <>
                        <TableCell>
                          {formatQuotaWithCurrency(
                            summary.data?.usage.find(
                              (row) => row.user_id === member.user_id
                            )?.used ?? 0
                          )}
                        </TableCell>
                        <TableCell>
                          {formatQuotaWithCurrency(
                            summary.data?.usage.find(
                              (row) => row.user_id === member.user_id
                            )?.reserved ?? 0
                          )}
                        </TableCell>
                      </>
                    )}
                    <TableCell className='text-end'>
                      {manage && member.status === 1 && (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setMonthlyMembers([member])}
                        >
                          {t('Set monthly limit')}
                        </Button>
                      )}
                      {manage &&
                        (props.budgets ||
                          (team && member.role !== 'owner')) && (
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => setDialog(member)}
                          >
                            {t('Edit')}
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!members.isPending && filtered.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('No members found')}</EmptyTitle>
                <EmptyDescription>
                  {t('Try a different search.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      {manage && team && !props.budgets && (
        <Card>
          <CardHeader>
            <CardTitle>{t('Invitations')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Username')}</TableHead>
                  <TableHead>{t('Role')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Expires')}</TableHead>
                  <TableHead className='text-end'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invites.data ?? []).map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.username}</TableCell>
                    <TableCell>{roleLabels[invite.role]}</TableCell>
                    <TableCell>{inviteLabels[invite.status]}</TableCell>
                    <TableCell>
                      {new Date(invite.expires_at * 1000).toLocaleDateString()}
                    </TableCell>
                    <TableCell className='text-end'>
                      {(invite.status === 'pending' ||
                        invite.status === 'expired') && (
                        <Button
                          size='sm'
                          variant='ghost'
                          disabled={resend.isPending}
                          onClick={() => resend.mutate(invite.id)}
                        >
                          {t('Resend')}
                        </Button>
                      )}
                      {invite.status === 'pending' && (
                        <Button
                          size='sm'
                          variant='ghost'
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(invite.id)}
                        >
                          {t('Revoke')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {dialog && (
        <MemberDialog
          member={dialog === 'invite' ? undefined : dialog}
          budget={props.budgets}
          close={() => setDialog(null)}
        />
      )}
    </div>
  )
}
