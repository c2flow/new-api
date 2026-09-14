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

import { OrganizationRemarkDialog } from '../components/OrganizationRemarkDialog'

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
const originalAdapter = api.defaults.adapter
const requests: InternalAxiosRequestConfig[] = []
let client: QueryClient
let success = true
beforeEach(() => {
  localStorage.clear()
  requests.length = 0
  success = true
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  api.defaults.adapter = async (config) => {
    requests.push(config)
    return {
      config,
      data: { success },
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
function show() {
  const close = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <OrganizationRemarkDialog
          organization={{
            id: 7,
            name: 'Team Seven',
            remark: 'Old note',
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
  return close
}
test.each([' Customer A ', ''])(
  'saves and clears organization remarks (%s)',
  async (remark) => {
    const close = show()
    expect(screen.getByRole('textbox', { name: 'Remark' })).toHaveValue(
      'Old note'
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Remark' }), {
      target: { value: remark },
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(requests[0].url).toBe('/api/platform/organizations/7/remark')
    expect(JSON.parse(requests[0].data)).toEqual({ remark: remark.trim() })
  }
)

test('overlong remarks cannot be submitted and rejected updates retain input', async () => {
  success = false
  const close = show()
  fireEvent.change(screen.getByRole('textbox', { name: 'Remark' }), {
    target: { value: '字'.repeat(256) },
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Maximum 255 characters.'
  )
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Remark' }), {
    target: { value: 'Corrected note' },
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed')
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Remark' })).toHaveValue(
    'Corrected note'
  )
})
