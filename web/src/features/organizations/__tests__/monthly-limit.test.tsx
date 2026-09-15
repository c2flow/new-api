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

import { api } from '@/lib/http-client'
import { useOrganizationStore } from '@/stores/organization-store'

import { Members } from '../components/Members'
import { MonthlyLimitDialog } from '../components/MonthlyLimitDialog'
import type { OrganizationMember } from '../types'

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
const originalAdapter = api.defaults.adapter
const requests: InternalAxiosRequestConfig[] = []
let response = {
  success: true,
  data: { id: 42 },
  message: '',
}
let client: QueryClient
const member: OrganizationMember = {
  id: 1,
  org_id: 10,
  user_id: 1,
  role: 'owner',
  status: 1,
  spend_limit: 0,
  email: 'owner@example.test',
  username: 'owner',
  display_name: 'Owner',
}

beforeEach(() => {
  localStorage.clear()
  useOrganizationStore.setState(useOrganizationStore.getInitialState(), true)
  useOrganizationStore.getState().bindUser(1)
  useOrganizationStore.getState().select(10)
  useOrganizationStore.getState().setContext(
    {
      organization: {
        id: 10,
        name: 'Review team',
        status: 1,
        owner_id: 1,
        group: 'default',
        quota: 0,
        used_quota: 0,
        budget_period_start: 0,
        budget_period_end: 0,
      },
      membership: member,
      capabilities: { org: {}, platform: {} },
      pending_transfer: false,
    },
    useOrganizationStore.getState().epoch
  )
  requests.length = 0
  response = {
    success: true,
    data: { id: 42 },
    message: '',
  }
  api.defaults.adapter = async (config) => {
    requests.push(config)
    return {
      config,
      data: response,
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
  client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { staleTime: Infinity, retry: false },
    },
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
  useOrganizationStore.setState(useOrganizationStore.getInitialState(), true)
  localStorage.clear()
})

function renderDialog(props: Parameters<typeof MonthlyLimitDialog>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MonthlyLimitDialog {...props} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

test('monthly cap is optional and batch submission changes no existing member fields', async () => {
  const close = vi.fn()
  renderDialog({ members: [member, { ...member, id: 2, user_id: 2 }], close })
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yes' } })
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(requests[0].url).toBe('/api/org/members/monthly-limit')
  const body = JSON.parse(requests[0].data)
  expect(Object.keys(body).sort()).toEqual(['monthly_spend_limit', 'user_ids'])
  expect(body.user_ids).toEqual([1, 2])
  expect(body.monthly_spend_limit).toBeGreaterThan(0)
})

test('turning off an existing monthly cap submits zero', async () => {
  const close = vi.fn()
  renderDialog({
    members: [{ ...member, monthly_spend_limit: 1000000 }],
    close,
  })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'no' } })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(JSON.parse(requests[0].data)).toEqual({
    user_ids: [1],
    monthly_spend_limit: 0,
  })
})

test('invalid monthly amounts cannot submit and failed requests retain the form', async () => {
  const close = vi.fn()
  response.success = false
  renderDialog({ members: [member], close })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'yes' } })
  fireEvent.change(screen.getByRole('spinbutton'), {
    target: { value: '1e100' },
  })
  await waitFor(() =>
    expect(screen.getByRole('spinbutton')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  )
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed')
  expect(close).not.toHaveBeenCalled()
})

test('members without caps have no monthly column; managers can select members for a batch', async () => {
  const context = useOrganizationStore.getState().context
  if (!context) throw new Error('Missing organization fixture')
  useOrganizationStore.setState({
    context: {
      ...context,
      capabilities: { platform: {}, org: { 'org.member': { write: true } } },
    },
  })
  client.setQueryData(
    ['organization-members', 10],
    [member, { ...member, id: 2, user_id: 2, username: 'second' }]
  )
  client.setQueryData(['organization-invites', 10], [])
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <Members />
      </QueryClientProvider>
    </I18nextProvider>
  )
  expect(
    screen.queryByRole('columnheader', { name: 'Monthly spending limit' })
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Select filtered members' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Set monthly limit (2)' }))
  expect(await screen.findByRole('dialog')).toHaveAccessibleName(
    'Monthly spending limit'
  )
})

test('ordinary members see monthly usage only when their cap is enabled', async () => {
  client.setQueryData(
    ['organization-members', 10],
    [
      {
        ...member,
        monthly_spend_limit: 1000000,
        monthly_usage: { used: 100, reserved: 200 },
        monthly_reset_at: 1790784000,
      },
    ]
  )
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <Members />
      </QueryClientProvider>
    </I18nextProvider>
  )
  expect(
    screen.getByRole('columnheader', { name: 'Monthly spending limit' })
  ).toBeVisible()
  expect(screen.queryByText(/Next reset/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Pending reservations/)).not.toBeInTheDocument()
  expect(screen.getByText(/Remaining/)).toBeVisible()
  expect(screen.getByText('Monthly spending limit')).toHaveAttribute(
    'title',
    'Resets on the first day of each month at 00:00 Beijing time.'
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Set monthly limit' })
  ).not.toBeInTheDocument()
})
