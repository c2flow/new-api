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
import {
  BookOpen01Icon,
  Building02Icon,
  Key01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { ADMIN_TRACK, ORGANIZATION_STEPS, QUICKSTART_TRACK } from './data'
import { writeTutorialSession } from './session'
import type {
  OrganizationTutorialRole,
  TutorialTrack,
  TutorialTrackID,
} from './types'

export function Tutorial() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.auth.user)
  const isPlatformAdmin = (user?.role ?? ROLE.GUEST) >= ROLE.ADMIN
  const [organizationRole, setOrganizationRole] =
    useState<OrganizationTutorialRole>('owner')

  const startTutorial = (
    trackID: TutorialTrackID,
    role?: OrganizationTutorialRole
  ) => {
    writeTutorialSession({ trackID, organizationRole: role, stepIndex: 0 })
    if (trackID !== 'organization') return
    const firstStep = ORGANIZATION_STEPS[role ?? 'owner'][0]
    void navigate({ to: firstStep.href })
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Usage tutorial')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-8 px-1 py-3 sm:px-3 sm:py-6'>
          <div className='max-w-2xl'>
            <h1 className='text-2xl font-semibold sm:text-3xl'>
              {t('Learn the complete workflow step by step')}
            </h1>
            <p className='text-muted-foreground mt-2 leading-6'>
              {t(
                'Follow each role from account setup to API calls, quota management, and log review.'
              )}
            </p>
          </div>

          <div
            className={cn(
              'grid gap-4 md:grid-cols-2',
              isPlatformAdmin && 'lg:grid-cols-3'
            )}
          >
            <TutorialCard
              track={QUICKSTART_TRACK}
              icon={Key01Icon}
              onStart={() => startTutorial('quickstart')}
            />
            <section className='border-border flex h-full flex-col rounded-lg border p-5'>
              <div className='bg-muted flex size-10 items-center justify-center rounded-lg'>
                <HugeiconsIcon icon={Building02Icon} className='size-5' />
              </div>
              <h2 className='mt-4 text-lg font-semibold'>
                {t('Organization collaboration')}
              </h2>
              <p className='text-muted-foreground mt-1 min-h-10 text-sm leading-5'>
                {t(
                  'Practice the owner, administrator, and member workflows in one guide.'
                )}
              </p>
              <Tabs
                value={organizationRole}
                onValueChange={(value) =>
                  setOrganizationRole(value as OrganizationTutorialRole)
                }
                className='mt-4'
              >
                <TabsList className='h-auto w-full flex-wrap'>
                  <TabsTrigger value='owner'>{t('Owner')}</TabsTrigger>
                  <TabsTrigger value='admin'>
                    {t('Organization Admin')}
                  </TabsTrigger>
                  <TabsTrigger value='member'>{t('Member')}</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                className='mt-auto w-full'
                onClick={() => startTutorial('organization', organizationRole)}
              >
                {t('Start')}
              </Button>
            </section>
            {isPlatformAdmin && (
              <TutorialCard
                track={ADMIN_TRACK}
                icon={Shield01Icon}
                onStart={() => startTutorial('admin')}
              />
            )}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

type TutorialCardProps = {
  track: TutorialTrack
  icon: Parameters<typeof HugeiconsIcon>[0]['icon']
  onStart: () => void
}

function TutorialCard(props: TutorialCardProps) {
  const { t } = useTranslation()
  return (
    <section className='border-border flex h-full flex-col rounded-lg border p-5'>
      <div className='bg-muted flex size-10 items-center justify-center rounded-lg'>
        <HugeiconsIcon icon={props.icon} className='size-5' />
      </div>
      <h2 className='mt-4 text-lg font-semibold'>{t(props.track.titleKey)}</h2>
      <p className='text-muted-foreground mt-1 min-h-10 text-sm leading-5'>
        {t(props.track.descriptionKey)}
      </p>
      <Button className='mt-auto w-full' onClick={props.onStart}>
        <HugeiconsIcon icon={BookOpen01Icon} data-icon='inline-start' />
        {t('Start')}
      </Button>
    </section>
  )
}
