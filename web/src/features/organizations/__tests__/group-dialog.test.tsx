import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { InternalAxiosRequestConfig } from 'axios'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { OrganizationGroupDialog } from '../components/OrganizationGroupDialog'

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
const originalAdapter = api.defaults.adapter
const requests: InternalAxiosRequestConfig[] = []
let client: QueryClient

beforeEach(() => {
  requests.length = 0
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  api.defaults.adapter = async (config) => {
    requests.push(config)
    return {
      config,
      data:
        config.method === 'get'
          ? { success: true, data: ['vip', 'default', 'auto'] }
          : { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
})

afterEach(() => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
})

test('platform administrator assigns an organization group from configured groups', async () => {
  const close = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <OrganizationGroupDialog
          organization={{
            id: 7,
            name: 'Team Seven',
            status: 1,
            owner_id: 2,
            quota: 1000000,
            used_quota: 0,
            group: 'default',
            budget_period_start: 0,
            budget_period_end: 0,
            owner_username: 'owner',
            owner_display_name: 'Owner',
          }}
          close={close}
        />
      </QueryClientProvider>
    </I18nextProvider>
  )

  const group = await screen.findByRole('combobox', { name: 'Group' })
  await screen.findByRole('option', { name: 'vip' })
  expect(screen.queryByRole('option', { name: 'auto' })).toBeNull()
  fireEvent.change(group, { target: { value: 'vip' } })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  const update = requests.find((request) => request.method === 'put')
  expect(update?.url).toBe('/api/platform/organizations/7/group')
  expect(JSON.parse(String(update?.data))).toEqual({ group: 'vip' })
})
