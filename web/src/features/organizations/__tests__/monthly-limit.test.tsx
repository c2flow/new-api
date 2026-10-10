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
import userEvent from '@testing-library/user-event'
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
  spend_limit: null,
  monthly_spend_limit: null,
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
      screen.getByRole('combobox', { name: new RegExp(`${label} Limit mode`) }),
      { target: { value: 'limited' } }
    )
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
    if (batch) {
      fireEvent.change(
        screen.getByRole('combobox', {
          name: 'Total spending limit Limit mode',
        }),
        { target: { value: 'limited' } }
      )
    } else {
      fireEvent.click(
        screen.getByRole('switch', {
          name: 'Total spending limit Set spending limit',
        })
      )
    }
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /Total spending limit/ }),
      { target: { value: '20' } }
    )
    if (batch) {
      fireEvent.change(
        screen.getByRole('combobox', {
          name: 'Monthly spending limit Limit mode',
        }),
        { target: { value: 'limited' } }
      )
    } else {
      fireEvent.click(
        screen.getByRole('switch', {
          name: 'Monthly spending limit Set spending limit',
        })
      )
    }
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

test('setting an existing monthly cap to zero blocks spending', async () => {
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

test('setting an existing total cap to zero blocks spending', async () => {
  const close = vi.fn()
  renderDialog({
    members: [{ ...member, spend_limit: 1000000 }],
    close,
  })
  fireEvent.change(
    screen.getByRole('spinbutton', { name: /Total spending limit/ }),
    { target: { value: '0' } }
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(JSON.parse(requests[0].data)).toEqual({
    user_ids: [1],
    spend_limit: 0,
  })
})

test('invalid monthly amounts cannot submit and failed requests retain the form', async () => {
  const close = vi.fn()
  response.success = false
  renderDialog({ members: [member], close })
  fireEvent.click(
    screen.getByRole('switch', {
      name: 'Monthly spending limit Set spending limit',
    })
  )
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
  expect(
    screen.queryByRole('button', { name: 'Batch edit spending limits' })
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Select filtered members' })
  )
  expect(screen.getByText('Selected 2 members')).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Batch edit spending limits' })
  )
  expect(await screen.findByRole('dialog')).toHaveAccessibleName(
    'Batch edit spending limits'
  )
})

test('Set spending limits opens both limits directly with no monthly column', async () => {
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
        <Members />
      </QueryClientProvider>
    </I18nextProvider>
  )
  expect(
    screen.queryByRole('columnheader', { name: 'Monthly spending limit' })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Set spending limits' }))
  expect(await screen.findByRole('dialog')).toHaveAccessibleName(
    'Edit spending limits'
  )
  expect(
    screen.getByRole('spinbutton', { name: /Monthly spending limit/ })
  ).toHaveValue(null)
  expect(
    screen.getByRole('spinbutton', { name: /Total spending limit/ })
  ).toHaveValue(null)
})

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
        <Members />
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

test.each(['Total spending limit', 'Monthly spending limit'])(
  'zero and unlimited remain distinct when editing %s',
  async (label) => {
    const field =
      label === 'Total spending limit' ? 'spend_limit' : 'monthly_spend_limit'
    const close = vi.fn()
    renderDialog({ members: [{ ...member, [field]: 0 }], close })
    expect(
      screen.getByRole('switch', { name: `${label} Set spending limit` })
    ).toBeChecked()
    expect(
      screen.getByRole('spinbutton', { name: new RegExp(label) })
    ).toHaveValue(0)
    fireEvent.click(
      screen.getByRole('switch', { name: `${label} Set spending limit` })
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(JSON.parse(requests[0].data)).toEqual({
      user_ids: [1],
      [field]: null,
    })
  }
)

test.each(['Total spending limit', 'Monthly spending limit'])(
  'an unlimited %s can be set to zero',
  async (label) => {
    const field =
      label === 'Total spending limit' ? 'spend_limit' : 'monthly_spend_limit'
    const close = vi.fn()
    renderDialog({ members: [member], close })
    const toggle = screen.getByRole('switch', {
      name: `${label} Set spending limit`,
    })
    expect(toggle).not.toBeChecked()
    expect(
      screen.getByRole('spinbutton', { name: new RegExp(label) })
    ).toBeDisabled()
    fireEvent.click(toggle)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(JSON.parse(requests[0].data)).toEqual({ user_ids: [1], [field]: 0 })
  }
)

test('a zero monthly cap is visible and displayed as a numeric limit', () => {
  client.setQueryData(
    ['organization-members', 10],
    [{ ...member, spend_limit: 0, monthly_spend_limit: 0 }]
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
    screen.getByRole('columnheader', { name: 'Monthly spending limit' })
  ).toBeVisible()
  const row = within(screen.getByRole('row', { name: /Owner/ }))
  expect(row.queryByText('Unlimited')).not.toBeInTheDocument()
  expect(row.getAllByText('$0')).toHaveLength(2)
})

test('keyboard toggling keeps the entered amount and only saves on submit', async () => {
  const user = userEvent.setup()
  const close = vi.fn()
  renderDialog({ members: [member], close })
  const toggle = screen.getByRole('switch', {
    name: 'Total spending limit Set spending limit',
  })
  const amount = screen.getByRole('spinbutton', {
    name: /Total spending limit/,
  })
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  toggle.focus()
  await user.keyboard('[Space]')
  expect(toggle).toBeChecked()
  expect(amount).toBeEnabled()
  await user.clear(amount)
  await user.type(amount, '7')
  await user.click(toggle)
  expect(toggle).not.toBeChecked()
  expect(amount).toBeDisabled()
  expect(amount).toHaveAttribute('placeholder', 'Unlimited')
  await user.keyboard('[Space]')
  expect(toggle).toBeChecked()
  expect(amount).toHaveValue(7)
  expect(requests).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(JSON.parse(requests[0].data)).toEqual({
    user_ids: [1],
    spend_limit: 3500000,
  })
})
