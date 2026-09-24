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
import { Building2, Loader2, Pencil, Plus, RefreshCcw } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { Dialog } from '@/components/dialog'
import { ProviderBadge } from '@/components/provider-badge'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

import { getVendors } from '../../api'
import { vendorsQueryKeys } from '../../lib'
import type { Vendor } from '../../types'

type VendorManagementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: () => void
  onEdit: (vendor: Vendor) => void
}

const defaultOverseasVendors = new Set([
  'anthropic',
  'openai',
  'xai',
  'gemini',
  'google',
])

function getOverseasPolicy(vendor: Vendor) {
  if (vendor.overseas_only === true) {
    return { labelKey: 'Overseas vendor', variant: 'warning' as const }
  }
  if (vendor.overseas_only === false) {
    return { labelKey: 'Available in China', variant: 'success' as const }
  }
  if (defaultOverseasVendors.has(vendor.name.trim().toLowerCase())) {
    return { labelKey: 'Overseas by default', variant: 'warning' as const }
  }
  return { labelKey: 'Available by default', variant: 'neutral' as const }
}

export function VendorManagementDialog(props: VendorManagementDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const query = useQuery({
    queryKey: vendorsQueryKeys.list({ page_size: 1000 }),
    queryFn: () => getVendors({ page_size: 1000 }),
    enabled: props.open,
  })

  const vendors = useMemo(
    () =>
      [...(query.data?.data?.items ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [query.data?.data?.items]
  )

  let content: ReactNode
  if (query.isLoading) {
    content = (
      <div className='flex flex-col items-center justify-center gap-2 py-12 text-center'>
        <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
        <p className='text-muted-foreground text-sm'>
          {t('Loading vendors...')}
        </p>
      </div>
    )
  } else if (vendors.length === 0) {
    content = (
      <Empty className='border border-dashed py-10'>
        <EmptyMedia variant='icon'>
          <Building2 className='h-6 w-6' />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{t('No vendors configured')}</EmptyTitle>
          <EmptyDescription>
            {t('Create a vendor to assign models and manage regional access.')}
          </EmptyDescription>
        </EmptyHeader>
        <Button size='sm' onClick={props.onCreate}>
          <Plus className='mr-2 h-4 w-4' />
          {t('New Vendor')}
        </Button>
      </Empty>
    )
  } else if (isMobile) {
    content = (
      <div className='space-y-3'>
        {vendors.map((vendor) => {
          const policy = getOverseasPolicy(vendor)
          return (
            <Card key={vendor.id} className='border-border/60'>
              <CardHeader className='flex flex-row items-start justify-between gap-4'>
                <div className='min-w-0 space-y-2'>
                  <CardTitle className='flex flex-wrap items-center gap-2'>
                    <ProviderBadge
                      iconKey={vendor.icon}
                      label={vendor.name}
                      copyable={false}
                    />
                    <TableId value={vendor.id} />
                  </CardTitle>
                  <CardDescription className='line-clamp-2'>
                    {vendor.description || t('No description provided')}
                  </CardDescription>
                  <StatusBadge
                    label={t(policy.labelKey)}
                    variant={policy.variant}
                    copyable={false}
                  />
                </div>
                <Button
                  size='icon'
                  variant='outline'
                  onClick={() => props.onEdit(vendor)}
                  aria-label={t('Edit vendor')}
                >
                  <Pencil className='h-4 w-4' />
                </Button>
              </CardHeader>
            </Card>
          )
        })}
      </div>
    )
  } else {
    content = (
      <StaticDataTable
        tableClassName='min-w-[680px]'
        data={vendors}
        getRowKey={(vendor) => vendor.id}
        columns={[
          {
            id: 'vendor',
            header: t('Vendor'),
            cellClassName: 'whitespace-normal',
            cell: (vendor) => (
              <div className='flex flex-col gap-1.5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <ProviderBadge
                    iconKey={vendor.icon}
                    label={vendor.name}
                    copyable={false}
                  />
                  <TableId value={vendor.id} />
                </div>
                <p className='text-muted-foreground max-w-md text-xs'>
                  {vendor.description || t('No description provided')}
                </p>
              </div>
            ),
          },
          {
            id: 'policy',
            header: t('Regional access'),
            cell: (vendor) => {
              const policy = getOverseasPolicy(vendor)
              return (
                <StatusBadge
                  label={t(policy.labelKey)}
                  variant={policy.variant}
                  copyable={false}
                />
              )
            },
          },
          {
            id: 'status',
            header: t('Status'),
            cell: (vendor) => (
              <StatusBadge
                label={vendor.status === 1 ? t('Enabled') : t('Disabled')}
                variant={vendor.status === 1 ? 'success' : 'neutral'}
                copyable={false}
              />
            ),
          },
          {
            id: 'actions',
            header: t('Actions'),
            className: 'text-right',
            cell: (vendor) => (
              <div className='flex justify-end'>
                <Button
                  size='icon-sm'
                  variant='ghost'
                  onClick={() => props.onEdit(vendor)}
                  aria-label={t('Edit vendor')}
                >
                  <Pencil />
                </Button>
              </div>
            ),
          },
        ]}
      />
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          <Building2 className='text-foreground/80 h-5 w-5' />
          {t('Manage Vendors')}
        </>
      }
      description={t(
        'View and edit vendor metadata and overseas access policies.'
      )}
      contentClassName={cn(
        'w-[calc(100vw-2rem)] sm:max-w-[52rem]',
        isMobile && 'max-w-none rounded-none'
      )}
      titleClassName='flex flex-wrap items-center gap-2 text-lg'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-md border p-2'>
        <Button size='sm' onClick={props.onCreate}>
          <Plus className='mr-2 h-4 w-4' />
          {t('New Vendor')}
        </Button>
        <div className='flex items-center gap-2'>
          <StatusBadge
            label={t('{{count}} vendors', { count: vendors.length })}
            variant='neutral'
            copyable={false}
          />
          <Button
            size='sm'
            variant='ghost'
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <RefreshCcw className='mr-2 h-4 w-4' />
            )}
            {t('Refresh')}
          </Button>
        </div>
      </div>

      {query.error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('Unable to load vendors')}</AlertTitle>
          <AlertDescription>
            {(query.error as Error).message || t('Operation failed')}
          </AlertDescription>
        </Alert>
      ) : null}

      {content}
    </Dialog>
  )
}
