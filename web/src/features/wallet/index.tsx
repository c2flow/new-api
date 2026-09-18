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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { getOrganizationSummary } from '@/features/organizations/api'
import { OrganizationSummary } from '@/features/organizations/components/OrganizationSummary'
import { useOrganization } from '@/features/organizations/context'
import { getAccountSummary, getSelf } from '@/lib/api'

import { AffiliateRewardsCard } from './components/affiliate-rewards-card'
import { TransferDialog } from './components/dialogs/transfer-dialog'
import { SubscriptionPlansCard } from './components/subscription-plans-card'
import { WalletStatsCard } from './components/wallet-stats-card'
import { useAffiliate, useTopupInfo } from './hooks'
import type { UserWalletData } from './types'

export function Wallet() {
  const { t } = useTranslation()
  const context = useOrganization()
  if (context && !context.capabilities.org['org.billing']?.write) {
    return (
      <div className='p-5'>
        {t('Only organization owners and administrators can manage payments.')}
      </div>
    )
  }
  return <WalletContent />
}

function WalletContent() {
  const { t } = useTranslation()
  const context = useOrganization()
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [showSubscriptionPanel, setShowSubscriptionPanel] = useState(true)

  const { topupInfo } = useTopupInfo()
  const {
    affiliateLink,
    loading: affiliateLoading,
    transferQuota,
    transferring,
  } = useAffiliate()

  // Fetch and refresh user data
  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const [response, summary] = await Promise.all([
        getSelf(),
        context ? getOrganizationSummary() : getAccountSummary(),
      ])
      if (response.success && response.data) {
        setUser({
          ...response.data,
          quota: summary.quota,
          used_quota: summary.used_quota,
          group: summary.group,
        } as UserWalletData)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [context])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // Handle transfer
  const handleTransfer = async (amount: number) => {
    const success = await transferQuota(amount)
    if (success) {
      await fetchUser()
    }
    return success
  }

  const handleSubscriptionAvailabilityChange = useCallback(
    (available: boolean) => {
      setShowSubscriptionPanel(available)
    },
    []
  )

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
            <OrganizationSummary />
            <WalletStatsCard user={user} loading={userLoading} />

            <div
              className={
                context === null && showSubscriptionPanel
                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start'
                  : 'grid gap-4'
              }
            >
              <p
                id='wallet-add-funds'
                className='text-muted-foreground scroll-mt-4 py-3 text-sm'
              >
                {t('Please contact an administrator to top up.')}
              </p>

              {context === null && (
                <SubscriptionPlansCard
                  topupInfo={topupInfo}
                  onAvailabilityChange={handleSubscriptionAvailabilityChange}
                  userQuota={user?.quota}
                  onPurchaseSuccess={fetchUser}
                />
              )}
            </div>

            {context === null && (
              <AffiliateRewardsCard
                user={user}
                affiliateLink={affiliateLink}
                onTransfer={() => setTransferDialogOpen(true)}
                complianceConfirmed={
                  topupInfo?.payment_compliance_confirmed !== false
                }
                loading={affiliateLoading}
              />
            )}
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onConfirm={handleTransfer}
        availableQuota={user?.aff_quota ?? 0}
        transferring={transferring}
      />
    </>
  )
}
