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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeEach, expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import { useAuthStore } from '@/stores/auth-store'

import { Tutorial } from '../index'
import { TUTORIAL_SESSION_KEY } from '../session'

beforeEach(async () => {
  sessionStorage.clear()
  useAuthStore.getState().auth.reset()
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  await i18next.changeLanguage('en')
})

function renderTutorial() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Tutorial }),
    history: createMemoryHistory({ initialEntries: ['/tutorial'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

test('regular users can start role tutorials without seeing platform administration', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'member', role: 1 })
  const router = renderTutorial()

  expect(
    await screen.findByRole('heading', { name: 'API quick start' })
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Platform administration' })
  ).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('tab', { name: 'Member' }))
  const organizationCard = screen
    .getByRole('heading', { name: 'Organization collaboration' })
    .closest('section')
  expect(organizationCard).not.toBeNull()
  await userEvent.click(
    within(organizationCard as HTMLElement).getByRole('button', {
      name: 'Start',
    })
  )
  expect(sessionStorage.getItem(TUTORIAL_SESSION_KEY)).toContain('organization')
  expect(sessionStorage.getItem(TUTORIAL_SESSION_KEY)).toContain('member')
  expect(router.state.location.pathname).toBe('/dashboard/overview')
})

test('platform administrators can start the administration walkthrough', async () => {
  useAuthStore.getState().auth.setUser({ id: 9, username: 'admin', role: 10 })
  renderTutorial()

  const card = (
    await screen.findByRole('heading', { name: 'Platform administration' })
  ).closest('section')
  expect(card).not.toBeNull()
  await userEvent.click(
    within(card as HTMLElement).getByRole('button', { name: 'Start' })
  )
  expect(sessionStorage.getItem(TUTORIAL_SESSION_KEY)).toContain('admin')
})
