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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Home } from '../index'

const originalAdapter = api.defaults.adapter
let client: QueryClient
let customContent = ''

beforeEach(async () => {
  localStorage.clear()
  customContent = ''
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useSystemConfigStore
    .getState()
    .setConfig({ systemName: 'C2Router', footerHtml: 'New API project footer' })
  useSystemConfigStore.getState().setLoading(false)
  i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  await i18next.changeLanguage('en')
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {
    docs_link: 'https://docs.newapi.pro',
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
  })
  client.setQueryData(['notice'], { success: true, data: '' })
  api.defaults.adapter = async (config) => ({
    data: { success: true, data: customContent },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })
})

afterEach(async () => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
  await i18next.changeLanguage('en')
})

async function renderHome() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Home }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('main')
  return router
}

test('default home keeps documentation with service and legal links', async () => {
  await renderHome()
  await screen.findByRole('heading', { name: 'AI within reach' })
  expect(document.body).not.toHaveTextContent(/new\s*api/i)
  const docsLinks = screen.getAllByRole('link', { name: 'Docs' })
  expect(docsLinks).toHaveLength(2)
  docsLinks.forEach((link) => expect(link).toHaveAttribute('href', '/docs'))
  expect(screen.queryByRole('link', { name: 'About' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'User Agreement' })).toHaveAttribute(
    'href',
    '/user-agreement'
  )
  expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    '/privacy-policy'
  )
  expect(screen.getByRole('link', { name: 'Hermes Agent' })).toHaveAttribute(
    'href',
    'https://hermes-agent.nousresearch.com/'
  )
  expect(
    screen.getByRole('link', { name: 'DeepSeek Harness' })
  ).toHaveAttribute('href', 'https://deepseek.com/harness/')
})

test('signed-out console entry preserves the dashboard destination through sign-in', async () => {
  await renderHome()
  expect(
    await screen.findByRole('link', { name: 'Enter Console' })
  ).toHaveAttribute('href', '/sign-in?redirect=%2Fdashboard')
  expect(screen.getByRole('link', { name: 'Browse Models' })).toHaveAttribute(
    'href',
    '/pricing'
  )
})

test('signed-in console entry goes directly to the dashboard and supports keyboard focus', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'reader', role: 1 })
  await renderHome()
  const main = await screen.findByRole('main')
  const consoleLink = within(main).getByRole('link', { name: 'Enter Console' })
  expect(consoleLink).toHaveAttribute('href', '/dashboard')
  consoleLink.focus()
  await userEvent.tab()
  expect(
    within(main).getByRole('link', { name: 'Browse Models' })
  ).toHaveFocus()
})

test('switching to Chinese displays the requested title and subtitle', async () => {
  await renderHome()
  await screen.findByRole('heading', { name: 'AI within reach' })
  await act(async () => {
    await i18next.changeLanguage('zh')
  })
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'AI 触手可及'
  )
  expect(screen.getByText('从这里，开始使用你需要的 AI 模型')).toBeVisible()
})

test('configured custom home content still replaces the default landing page', async () => {
  customContent = '# Service announcements'
  await renderHome()
  expect(
    await screen.findByRole('heading', { name: 'Service announcements' })
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'AI within reach' })
  ).not.toBeInTheDocument()
})

test('opening the mobile menu preserves documentation in service navigation', async () => {
  await renderHome()
  await screen.findByRole('heading', { name: 'AI within reach' })
  const menuButton = screen.getByRole('button', {
    name: 'Toggle navigation menu',
  })
  expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(menuButton)
  expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('heading', { name: 'AI within reach' })).toBeVisible()
  expect(screen.getAllByRole('link', { name: 'Model Square' })).toHaveLength(2)
  expect(screen.getAllByRole('link', { name: 'Docs' })).toHaveLength(2)
})
