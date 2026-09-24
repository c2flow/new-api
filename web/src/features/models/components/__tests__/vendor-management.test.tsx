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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import { VendorManagement } from '../dialogs/vendor-management'

const apiMocks = vi.hoisted(() => ({
  getVendors: vi.fn(),
  updateVendor: vi.fn(),
}))

vi.mock('../../api', async () => {
  return {
    getVendors: apiMocks.getVendors,
    updateVendor: apiMocks.updateVendor,
    createVendor: vi.fn(),
  }
})

vi.mock('@/components/provider-badge', () => ({
  ProviderBadge: ({ label }: { label: string }) => <span>{label}</span>,
}))

describe('vendor management', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Manage Vendors': 'Manage Vendors',
      'Edit vendor': 'Edit vendor',
      'Edit Vendor': 'Edit Vendor',
      'Overseas vendor': 'Overseas vendor',
      'Regional access': 'Regional access',
      Status: 'Status',
      Enabled: 'Enabled',
      Actions: 'Actions',
      Vendor: 'Vendor',
      Refresh: 'Refresh',
      'New Vendor': 'New Vendor',
      'No description provided': 'No description provided',
      'View and edit vendor metadata and overseas access policies.':
        'View and edit vendor metadata and overseas access policies.',
      '{{count}} vendors': '{{count}} vendors',
      'Update vendor information for {{name}}':
        'Update vendor information for {{name}}',
      'Vendor Name *': 'Vendor Name *',
      Description: 'Description',
      Icon: 'Icon',
      Cancel: 'Cancel',
      Update: 'Update',
    })
  })

  test('opens an existing vendor in edit mode from the management list', async () => {
    apiMocks.getVendors.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 7,
            name: 'OpenAI',
            description: 'OpenAI models',
            icon: 'OpenAI',
            status: 1,
            overseas_only: true,
            created_time: 1,
            updated_time: 1,
          },
        ],
        total: 1,
        page: 1,
        page_size: 1000,
      },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <VendorManagement open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('OpenAI')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit vendor' }))

    expect(
      await screen.findByRole('heading', { name: 'Edit Vendor' })
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Vendor Name *' })).toHaveValue(
      'OpenAI'
    )
    expect(
      screen.getByRole('switch', { name: 'Overseas vendor' })
    ).toBeChecked()

    queryClient.clear()
  })

  test('returns to the refreshed vendor list after saving an edit', async () => {
    apiMocks.getVendors.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 9,
            name: 'Anthropic',
            description: '',
            icon: 'Anthropic',
            status: 1,
            overseas_only: true,
            created_time: 1,
            updated_time: 1,
          },
        ],
        total: 1,
        page: 1,
        page_size: 1000,
      },
    })
    apiMocks.updateVendor.mockResolvedValue({ success: true })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <VendorManagement open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    await screen.findByText('Anthropic')
    fireEvent.click(screen.getByRole('button', { name: 'Edit vendor' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Update' }))

    await waitFor(() => expect(apiMocks.updateVendor).toHaveBeenCalled())
    expect(
      await screen.findByRole('heading', { name: 'Manage Vendors' })
    ).toBeInTheDocument()

    queryClient.clear()
  })
})
