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
  Link,
  RouterProvider,
  useLocation,
} from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { useAuthStore } from '@/stores/auth-store'

import { TutorialCoach } from '../components/tutorial-coach'
import { TUTORIAL_SESSION_KEY } from '../session'

beforeEach(async () => {
  sessionStorage.clear()
  useAuthStore.getState().auth.reset()
  useAuthStore.getState().auth.setUser({ id: 2, username: 'member', role: 1 })
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  await i18next.changeLanguage('en')
})

type RectOptions = {
  targetTop?: number
  targetHeight?: number
  coachHeight?: number
}

function renderCoach(options: RectOptions = {}) {
  const targetTop = options.targetTop ?? 80
  const targetHeight = options.targetHeight ?? 48
  const targetRect = {
    top: targetTop,
    left: 120,
    width: 240,
    height: targetHeight,
    right: 360,
    bottom: targetTop + targetHeight,
    x: 120,
    y: targetTop,
    toJSON: () => ({}),
  }
  const coachRect = {
    ...targetRect,
    top: 0,
    bottom: options.coachHeight ?? 160,
    y: 0,
    height: options.coachHeight ?? 160,
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? coachRect : targetRect
    }
  )
  function TestPage() {
    const pathname = useLocation({ select: (location) => location.pathname })
    return (
      <>
        {pathname === '/tutorial' ? (
          <Link to='/keys'>API Keys</Link>
        ) : (
          <>
            <button type='button' data-tutorial='create-api-key'>
              Create API Key
            </button>
            <input aria-label='Key name' data-tutorial='api-key-name' />
            <div data-tutorial='api-key-list'>API key list</div>
          </>
        )}
        <TutorialCoach />
      </>
    )
  }
  const router = createRouter({
    routeTree: createRootRoute({
      component: TestPage,
    }),
    history: createMemoryHistory({ initialEntries: ['/tutorial'] }),
  })
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('waits for each real user action without rendering navigation controls', async () => {
  sessionStorage.setItem(
    TUTORIAL_SESSION_KEY,
    JSON.stringify({ trackID: 'quickstart', stepIndex: 0 })
  )
  renderCoach()

  expect(
    await screen.findByRole('dialog', { name: 'Usage tutorial' })
  ).toHaveTextContent('Create API Key')
  expect(screen.getByRole('link', { name: 'API Keys' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Previous' })
  ).not.toBeInTheDocument()
  expect(await screen.findByTestId('tutorial-highlight')).toHaveStyle({
    top: '72px',
    left: '112px',
  })
  expect(screen.getByRole('dialog')).toHaveStyle({
    top: '152px',
    bottom: 'auto',
    left: '12px',
  })

  await userEvent.click(screen.getByRole('link', { name: 'API Keys' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Create API Key')

  await userEvent.click(screen.getByRole('button', { name: 'Create API Key' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Name')

  await userEvent.type(
    screen.getByRole('textbox', { name: 'Key name' }),
    'demo'
  )
  expect(screen.getByRole('dialog')).toHaveTextContent('Name')
  await userEvent.tab()
  expect(screen.getByRole('dialog')).toHaveTextContent('Save changes')
})

test('places the coach above a target near the bottom without overlap', async () => {
  sessionStorage.setItem(
    TUTORIAL_SESSION_KEY,
    JSON.stringify({ trackID: 'quickstart', stepIndex: 0 })
  )
  renderCoach({ targetTop: 680, targetHeight: 48, coachHeight: 160 })

  const dialog = await screen.findByRole('dialog', { name: 'Usage tutorial' })
  await vi.waitFor(() => {
    expect(dialog).toHaveStyle({ top: '496px', bottom: 'auto' })
  })
  expect(496 + 160).toBeLessThan(680 - 8)
})

test('advances from the curl key step only after a plausible key is pasted', async () => {
  sessionStorage.setItem(
    TUTORIAL_SESSION_KEY,
    JSON.stringify({ trackID: 'quickstart', stepIndex: 5 })
  )
  renderCoach()
  await userEvent.click(await screen.findByRole('link', { name: 'API Keys' }))

  const input = await screen.findByLabelText('API key')
  await userEvent.type(input, 'short-key')
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Paste the API key you just copied.'
  )

  fireEvent.paste(input, {
    clipboardData: {
      getData: () => `Tutorial key\tsk-${'a'.repeat(48)}`,
    },
  })
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Replace YOUR_API_KEY with the key you just created.'
  )
  expect(screen.getByText(new RegExp(`sk-${'a'.repeat(48)}`))).toBeVisible()
})

test('removes an administration walkthrough from a non-admin session', async () => {
  sessionStorage.setItem(
    TUTORIAL_SESSION_KEY,
    JSON.stringify({ trackID: 'admin', stepIndex: 0 })
  )
  renderCoach()

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('dialog', { name: 'Usage tutorial' })
    ).not.toBeInTheDocument()
    expect(sessionStorage.getItem(TUTORIAL_SESSION_KEY)).toBeNull()
  })
})
