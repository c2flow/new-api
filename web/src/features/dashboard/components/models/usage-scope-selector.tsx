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
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UsageScope } from '@/features/dashboard/lib/usage-scope'
import {
  getOrganizationMembers,
  getPlatformOrganizationMembers,
} from '@/features/organizations/api'
import type { OrganizationMember } from '@/features/organizations/types'
import { useAuthStore } from '@/stores/auth-store'
import { useOrganizationStore } from '@/stores/organization-store'

interface UsageScopeSelectionProps {
  value: UsageScope
  onChange: (value: UsageScope) => void
  organizationID?: number
  currentUserID?: number
  variant?: 'button' | 'table-header'
}

interface UsageScopeSelectorProps extends UsageScopeSelectionProps {
  members: Pick<OrganizationMember, 'user_id' | 'username' | 'display_name'>[]
  currentUserID: number
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

export function OrganizationUsageSelector(props: UsageScopeSelectionProps) {
  const userID = useAuthStore((state) => state.auth.user?.id)
  const activeOrgID = useOrganizationStore(
    (state) => state.context?.organization?.id
  )
  const orgID = props.organizationID ?? activeOrgID
  const epoch = useOrganizationStore((state) => state.epoch)
  const members = useQuery({
    queryKey: ['organization-members', orgID, userID, epoch],
    queryFn: () =>
      props.organizationID != null
        ? getPlatformOrganizationMembers(props.organizationID)
        : getOrganizationMembers(),
    enabled: !!orgID && !!(props.currentUserID ?? userID),
  })
  return (
    <UsageScopeSelector
      {...props}
      members={members.data ?? []}
      currentUserID={props.currentUserID ?? userID ?? 0}
      loading={members.isPending}
      error={members.isError}
      onRetry={() => void members.refetch()}
    />
  )
}

export function UsageScopeSelector(props: UsageScopeSelectorProps) {
  const { t } = useTranslation()
  const organization = props.value.type === 'organization'
  const selected = props.value.type === 'members' ? props.value.userIDs : []
  // Keep the current user first, regardless of the API's member ordering.
  const options = [
    { id: props.currentUserID, label: t('Me') },
    ...props.members
      .filter((member) => member.user_id !== props.currentUserID)
      .map((member) => ({
        id: member.user_id,
        label: member.display_name
          ? `${member.display_name} (@${member.username})`
          : member.username,
      })),
  ]
  const label = organization
    ? t('Organization total')
    : options
        .filter((option) => selected.includes(option.id))
        .map((option) => option.label)
        .join(' / ')
  const tableHeader = props.variant === 'table-header'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          tableHeader ? (
            <button
              type='button'
              className='hover:bg-muted focus-visible:ring-ring -ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
              aria-label={t('Usage scope')}
              title={label}
            />
          ) : (
            <Button variant='outline' size='sm' aria-label={t('Usage scope')} />
          )
        }
      >
        {tableHeader ? (
          <span>{t('User')}</span>
        ) : (
          <span className='max-w-52 truncate' title={label}>
            {label || t('Organization members')}
          </span>
        )}
        <ChevronDown aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={tableHeader ? 'start' : 'end'}
        className='w-72 max-w-[calc(100vw-2rem)]'
      >
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={organization}
            disabled={organization}
            closeOnClick={false}
            onCheckedChange={() => props.onChange({ type: 'organization' })}
          >
            {t('Organization total')}
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('Organization members')}</DropdownMenuLabel>
          <div className='max-h-64 overflow-y-auto'>
            {options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.id}
                checked={selected.includes(option.id)}
                disabled={selected.length === 1 && selected.includes(option.id)}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  props.onChange({
                    type: 'members',
                    userIDs: checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id),
                  })
                }
              >
                <span className='truncate' title={option.label}>
                  {option.label}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </div>
          {props.loading && (
            <DropdownMenuItem disabled>{t('Loading')}</DropdownMenuItem>
          )}
          {props.error && (
            <DropdownMenuItem closeOnClick={false} onClick={props.onRetry}>
              {t('Request failed')} · {t('Retry')}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
