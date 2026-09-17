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
import { cleanup, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'

import { DocumentationContent } from '../index'

beforeEach(async () => {
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  await i18next.changeLanguage('en')
})

afterEach(() => cleanup())

function renderDocumentation() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <DocumentationContent
          gatewayUrl='https://api.example.com'
          baseUrl='https://api.example.com/v1'
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/docs'] }),
  })

  render(<RouterProvider router={router} />)
}

test('authentication guidance is included once with the first request', async () => {
  renderDocumentation()

  const firstRequestHeading = await screen.findByRole('heading', {
    name: 'Send your first request',
  })
  const firstRequestSection = firstRequestHeading.closest('section')

  expect(
    screen.queryByRole('heading', { name: 'Authentication' })
  ).not.toBeInTheDocument()
  expect(firstRequestSection).toHaveTextContent(
    'Authorization: Bearer YOUR_API_KEY'
  )
  expect(
    document.body.textContent?.match(/Authorization: Bearer YOUR_API_KEY/g)
  ).toHaveLength(1)
})

test('documentation content uses a centered layout without a section sidebar', async () => {
  renderDocumentation()

  const quickStartHeading = await screen.findByRole('heading', {
    name: 'Quick start',
  })
  const article = quickStartHeading.closest('article')

  expect(
    screen.queryByRole('navigation', { name: 'Documentation sections' })
  ).not.toBeInTheDocument()
  expect(article).toHaveClass('mx-auto', 'max-w-5xl')
})

test('documentation content omits the promotional header', async () => {
  renderDocumentation()

  await screen.findByRole('heading', { name: 'Quick start' })
  expect(document.querySelector('header')).not.toBeInTheDocument()
})

test('quick start only links to API key creation', async () => {
  renderDocumentation()

  const quickStartHeading = await screen.findByRole('heading', {
    name: 'Quick start',
  })
  const quickStartSection = quickStartHeading.closest('section')

  expect(quickStartSection).toHaveTextContent('Create an API key')
  expect(quickStartSection).not.toHaveTextContent('Choose a model')
  expect(quickStartSection).not.toHaveTextContent('Make a request')
})

test('documentation omits the external documentation prompt', async () => {
  renderDocumentation()

  await screen.findByRole('heading', { name: 'Quick start' })
  expect(screen.queryByText('Need more details?')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Open the extended documentation' })
  ).not.toBeInTheDocument()
})
