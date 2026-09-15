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
  within,
} from '@testing-library/react'
import type { InternalAxiosRequestConfig } from 'axios'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/http-client'
import { useOrganizationStore } from '@/stores/organization-store'

import { MemberLimitsDialog } from '../components/MemberLimitsDialog'
import { Members } from '../components/Members'
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

function renderDialog(props: Parameters<typeof MemberLimitsDialog>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemberLimitsDialog {...props} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

test.each(['Total spending limit', 'Monthly spending limit'])(
  'batch editing only %s preserves the other limit',
  async (label) => {
    const close = vi.fn()
    renderDialog({ members: [member, { ...member, id: 2, user_id: 2 }], close })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(
      screen.getByRole('spinbutton', { name: new RegExp(label) }),
      { target: { value: '2' } }
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(requests[0].url).toBe('/api/org/members/limits')
    const body = JSON.parse(requests[0].data)
    const field =
      label === 'Total spending limit' ? 'spend_limit' : 'monthly_spend_limit'
    expect(body).toEqual({ user_ids: [1, 2], [field]: 1000000 })
  }
)

test.each([false, true])(
  'single submission saves both limits with batch=%s',
  async (batch) => {
    const close = vi.fn()
    renderDialog({
      members: batch ? [member, { ...member, id: 2, user_id: 2 }] : [member],
      batch,
      close,
    })
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /Total spending limit/ }),
      { target: { value: '20' } }
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /Monthly spending limit/ }),
      { target: { value: '5' } }
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0].data)).toEqual({
      user_ids: batch ? [1, 2] : [1],
      spend_limit: 10000000,
      monthly_spend_limit: 2500000,
    })
  }
)

test('turning off an existing monthly cap submits zero', async () => {
  const close = vi.fn()
  renderDialog({
    members: [{ ...member, monthly_spend_limit: 1000000 }],
    close,
  })
  expect(
    screen.getByRole('spinbutton', { name: /Monthly spending limit/ })
  ).toHaveValue(2)
  fireEvent.change(
    screen.getByRole('spinbutton', { name: /Monthly spending limit/ }),
    { target: { value: '0' } }
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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
  fireEvent.change(
    screen.getByRole('spinbutton', { name: /Monthly spending limit/ }),
    {
      target: { value: '1e100' },
    }
  )
  await waitFor(() =>
    expect(
      screen.getByRole('spinbutton', { name: /Monthly spending limit/ })
    ).toHaveAttribute('aria-invalid', 'true')
  )
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(
    screen.getByRole('spinbutton', { name: /Monthly spending limit/ }),
    { target: { value: '1' } }
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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
  fireEvent.click(
    screen.getByRole('button', { name: 'Batch edit spending limits' })
  )
  expect(await screen.findByRole('dialog')).toHaveAccessibleName(
    'Batch edit spending limits'
  )
})

test.each([false, true])(
  'Edit opens both limits directly with budgets=%s and no monthly column',
  async (budgets) => {
    const context = useOrganizationStore.getState().context
    if (!context) throw new Error('Missing organization fixture')
    useOrganizationStore.setState({
      context: {
        ...context,
        capabilities: { platform: {}, org: { 'org.member': { write: true } } },
      },
    })
    client.setQueryData(['organization-members', 10], [member])
    client.setQueryData(['organization-invites', 10], [])
    client.setQueryData(['organization-summary', 10], { usage: [] })
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <Members budgets={budgets} />
        </QueryClientProvider>
      </I18nextProvider>
    )
    expect(
      screen.queryByRole('columnheader', { name: 'Monthly spending limit' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'Edit spending limits'
    )
    expect(
      screen.getByRole('spinbutton', { name: /Monthly spending limit/ })
    ).toHaveValue(0)
    expect(
      screen.getByRole('spinbutton', { name: /Total spending limit/ })
    ).toHaveValue(0)
  }
)

test('total and monthly limits show matching usage rows with nonzero reservations', async () => {
  client.setQueryData(
    ['organization-members', 10],
    [
      {
        ...member,
        monthly_spend_limit: 1000000,
        spend_limit: 2000000,
        total_usage: { used: 500000, reserved: 0 },
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
  expect(screen.getAllByText(/^Used:/)).toHaveLength(2)
  expect(screen.getAllByText(/Pending reservations/)).toHaveLength(1)
  expect(screen.queryByText(/Remaining/)).not.toBeInTheDocument()
  expect(
    screen.queryByRole('columnheader', { name: 'Total spending' })
  ).not.toBeInTheDocument()
  expect(screen.getByText('Monthly spending limit')).toHaveAttribute(
    'title',
    'Resets on the first day of each month at 00:00 Beijing time.'
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Set monthly limit' })
  ).not.toBeInTheDocument()
})

test('unlimited members still show both usage amounts when the monthly column is visible', () => {
  client.setQueryData(
    ['organization-members', 10],
    [
      { ...member, id: 2, user_id: 2, monthly_spend_limit: 1000000 },
      {
        ...member,
      username: 'unlimited',
      display_name: 'unlimited',
        total_usage: { used: 1500000, reserved: 0 },
        monthly_usage: { used: 500000, reserved: 0 },
      },
    ]
  )
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <Members budgets />
      </QueryClientProvider>
    </I18nextProvider>
  )
  const row = within(screen.getByRole('row', { name: /unlimited/ }))
  expect(row.getAllByText('Unlimited')).toHaveLength(2)
  expect(row.getAllByText(/^Used:/)).toHaveLength(2)
  expect(row.getByText('Used: $3')).toBeVisible()
  expect(row.getByText('Used: $1')).toBeVisible()
  expect(row.queryByText(/Pending reservations/)).not.toBeInTheDocument()
  expect(
    screen.queryByRole('columnheader', { name: 'Total spending' })
  ).not.toBeInTheDocument()
})
