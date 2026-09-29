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
import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FlowCharts } from '@/features/dashboard/components/flow/flow-charts'
import { ModelAnalytics } from '@/features/dashboard/components/models/model-analytics'
import { ModelsChartPreferences } from '@/features/dashboard/components/models/models-chart-preferences'
import { ModelsFilter } from '@/features/dashboard/components/models/models-filter-dialog'
import { OrganizationUsageSelector } from '@/features/dashboard/components/models/usage-scope-selector'
import {
  buildDefaultDashboardFilters,
  getSavedChartPreferences,
  saveChartPreferences,
} from '@/features/dashboard/lib'
import type { UsageScope } from '@/features/dashboard/lib/usage-scope'
import type {
  DashboardChartPreferences,
  DashboardFilters,
} from '@/features/dashboard/types'
import { PlatformOrganizationScopeContext } from '@/features/organizations/platform-view'

import { OrganizationSummary } from './OrganizationSummary'

type Section = 'models' | 'flow'

export function PlatformOrganizationDashboard(props: {
  organization: { id: number; name: string; owner_id: number }
}) {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('models')
  const [preferences, setPreferences] = useState<DashboardChartPreferences>(
    () => getSavedChartPreferences()
  )
  const [filters, setFilters] = useState<DashboardFilters>(() =>
    buildDefaultDashboardFilters(getSavedChartPreferences())
  )
  const [sensitiveVisible, setSensitiveVisible] = useState(true)
  const [modelScope, setModelScope] = useState<UsageScope>({
    type: 'organization',
  })

  const handlePreferencesChange = useCallback(
    (next: DashboardChartPreferences) => {
      setPreferences(next)
      setFilters(buildDefaultDashboardFilters(next))
      saveChartPreferences(next)
    },
    []
  )

  return (
    <PlatformOrganizationScopeContext.Provider value={props.organization.id}>
      <div className='space-y-4'>
        <OrganizationSummary
          platformOrganization={props.organization}
          hideOwnerAndPersonalQuota
        />
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Tabs
            value={section}
            onValueChange={(value) => setSection(value as Section)}
          >
            <TabsList>
              <TabsTrigger value='models'>
                {t('Model Call Analytics')}
              </TabsTrigger>
              <TabsTrigger value='flow'>{t('Flow')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className='flex flex-wrap items-center gap-2'>
            {section === 'models' ? (
              <>
                <OrganizationUsageSelector
                  value={modelScope}
                  onChange={setModelScope}
                  organizationID={props.organization.id}
                  currentUserID={props.organization.owner_id}
                />
                <ModelsChartPreferences
                  preferences={preferences}
                  onPreferencesChange={handlePreferencesChange}
                />
              </>
            ) : (
              <Button
                variant='ghost'
                size='icon'
                onClick={() => setSensitiveVisible((visible) => !visible)}
                aria-label={
                  sensitiveVisible
                    ? t('Hide sensitive data')
                    : t('Show sensitive data')
                }
              >
                {sensitiveVisible ? <Eye /> : <EyeOff />}
              </Button>
            )}
            <ModelsFilter
              preferences={preferences}
              currentFilters={filters}
              onFilterChange={setFilters}
              onReset={() =>
                setFilters(buildDefaultDashboardFilters(preferences))
              }
              titleKey={section === 'flow' ? 'Flow Filters' : undefined}
              descriptionKey={
                section === 'flow'
                  ? 'Filter the traffic flow view by time range and user.'
                  : undefined
              }
            />
          </div>
        </div>
        {section === 'models' ? (
          <ModelAnalytics
            filters={filters}
            preferences={preferences}
            scope={modelScope}
          />
        ) : (
          <FlowCharts filters={filters} sensitiveVisible={sensitiveVisible} />
        )}
      </div>
    </PlatformOrganizationScopeContext.Provider>
  )
}
