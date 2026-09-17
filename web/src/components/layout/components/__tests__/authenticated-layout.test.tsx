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

import { AuthenticatedLayout } from '../authenticated-layout'

vi.mock('@/components/page-transition', () => ({
  AnimatedOutlet: () => <div>Route content</div>,
}))

vi.mock('@/components/skip-to-main', () => ({
  SkipToMain: () => null,
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: (props: { children?: React.ReactNode }) => props.children,
  SidebarInset: (props: { children?: React.ReactNode }) => (
    <main>{props.children}</main>
  ),
}))

vi.mock('@/context/layout-provider', () => ({
  LayoutProvider: (props: { children?: React.ReactNode }) => props.children,
}))

vi.mock('@/context/search-provider', () => ({
  SearchProvider: (props: { children?: React.ReactNode }) => props.children,
}))

vi.mock('@/features/organizations/components/OrganizationSwitcher', () => ({
  OrganizationSwitcher: () => null,
}))

vi.mock('@/features/organizations/context', () => ({
  useHasTeamOrganizations: () => false,
}))

vi.mock('@/features/organizations/OrganizationBoundary', () => ({
  OrganizationBoundary: (props: { children?: React.ReactNode }) =>
    props.children,
}))

vi.mock('@/lib/cookies', () => ({
  getCookie: () => undefined,
}))

vi.mock('../app-header', () => ({
  AppHeader: (props: { showSidebarTrigger?: boolean }) => (
    <header data-sidebar-trigger={String(props.showSidebarTrigger)} />
  ),
}))

vi.mock('../app-sidebar', () => ({
  AppSidebar: () => <nav aria-label='Application sidebar' />,
}))

afterEach(() => cleanup())

function renderLayout(pathname: string) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AuthenticatedLayout>
          <div>Page content</div>
        </AuthenticatedLayout>
      ),
    }),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  render(<RouterProvider router={router} />)
}

test('documentation route hides the application sidebar and its toggle', async () => {
  renderLayout('/docs')

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: 'Application sidebar' })
  ).not.toBeInTheDocument()
  expect(document.querySelector('header')).toHaveAttribute(
    'data-sidebar-trigger',
    'false'
  )
})

test('dashboard routes keep the application sidebar and its toggle', async () => {
  renderLayout('/dashboard')

  expect(
    await screen.findByRole('navigation', { name: 'Application sidebar' })
  ).toBeInTheDocument()
  expect(document.querySelector('header')).toHaveAttribute(
    'data-sidebar-trigger',
    'true'
  )
})
