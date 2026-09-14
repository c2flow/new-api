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
import { parseQuotaFromDollars } from '@/lib/format'

import { OrganizationQuotaDialog } from '../components/OrganizationQuotaDialog'
import { quotaAdjustmentSchema } from '../lib/quota-adjustment'

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
        <OrganizationQuotaDialog
          organization={{
            id: 7,
            name: 'Team Seven',
            slug: 'seven',
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
test.each(['add', 'subtract', 'override'])(
  'submits %s to the platform organization and closes after success',
  async (mode) => {
    const close = show()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Adjust Quota')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: mode },
    })
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: mode === 'override' ? '0' : '1' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), {
      target: { value: ' Correction ' },
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('/api/platform/organizations/7/quota')
    expect(JSON.parse(requests[0].data)).toEqual({
      mode,
      value: mode === 'override' ? 0 : parseQuotaFromDollars(1),
      reason: 'Correction',
    })
  }
)
test('a rejected adjustment keeps the form for correction', async () => {
  success = false
  const close = show()
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), {
    target: { value: 'Correction' },
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Failed to adjust quota'
  )
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Reason' })).toHaveValue(
    'Correction'
  )
})
test.each(['', 'NaN', 'Infinity', '1e100', '-1', '0'])(
  'rejects invalid added amount %s',
  (amount) => {
    expect(
      quotaAdjustmentSchema.safeParse({
        mode: 'add',
        amount,
        reason: 'Correction',
      }).success
    ).toBe(false)
  }
)
test('rejects a reason exceeding the backend UTF-8 limit', () => {
  expect(
    quotaAdjustmentSchema.safeParse({
      mode: 'add',
      amount: '1',
      reason: '调'.repeat(86),
    }).success
  ).toBe(false)
})
