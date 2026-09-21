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
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { useOrganizationStore } from '@/stores/organization-store'

import { Dashboard } from '../index'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/features/dashboard/route', () => ({
  useDashboardRoute: () => ({ useParams: () => ({ section: 'overview' }) }),
}))

vi.mock('@/features/organizations/components/OrganizationSummary', () => ({
  OrganizationSummary: () => <section aria-label='Organization summary' />,
}))

vi.mock('@/features/organizations/platform-view', () => ({
  usePlatformView: () => false,
}))

vi.mock('../components/overview/overview-dashboard', () => ({
  OverviewDashboard: () => <section aria-label='Overview content' />,
}))

afterEach(() => {
  cleanup()
  useOrganizationStore.setState(useOrganizationStore.getInitialState(), true)
})

test('organization summary uses the same horizontal content boundary as the overview', async () => {
  useOrganizationStore.setState({
    context: {
      organization: {
        id: 2,
        name: 'Design team',
        owner_id: 1,
        status: 1,
        group: 'default',
        quota: 0,
        used_quota: 0,
        budget_period_start: 0,
        budget_period_end: 0,
      },
      membership: {
        id: 1,
        org_id: 2,
        user_id: 1,
        role: 'owner',
        spend_limit: 0,
        status: 1,
        username: 'owner',
        display_name: '',
        email: '',
      },
      capabilities: { org: {}, platform: {} },
      pending_transfer: false,
    },
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: Dashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  const summary = await screen.findByRole('region', {
    name: 'Organization summary',
  })
  expect(summary.parentElement).toHaveClass('pb-4')
  expect(summary.parentElement).not.toHaveClass('px-4')
})
