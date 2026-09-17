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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import { ToolGuides } from '../tool-guides'

afterEach(cleanup)

test('CC Switch shows the endpoint format required by each target application', () => {
  render(
    <ToolGuides
      gatewayUrl='https://gateway.example.com'
      baseUrl='https://gateway.example.com/v1'
    />
  )

  expect(screen.getByText('Claude endpoint').nextSibling).toHaveTextContent(
    'https://gateway.example.com'
  )
  expect(screen.getByText('Codex endpoint').nextSibling).toHaveTextContent(
    'https://gateway.example.com/v1'
  )
})

test('tool tabs keep a compact selected pill inside a padded track', () => {
  render(
    <ToolGuides
      gatewayUrl='https://gateway.example.com'
      baseUrl='https://gateway.example.com/v1'
    />
  )

  const tab = screen.getByRole('tab', { name: 'CC Switch' })
  const tabList = screen.getByRole('tablist')

  expect(tab).toHaveClass('w-fit', 'min-w-24', 'justify-self-center')
  expect(tabList).toHaveClass(
    'py-1.5',
    'group-data-horizontal/tabs:h-auto',
    'lg:grid-cols-6'
  )
})

test('switching tabs shows the selected tool configuration with the current gateway URL', async () => {
  render(
    <ToolGuides
      gatewayUrl='https://gateway.example.com'
      baseUrl='https://gateway.example.com/v1'
    />
  )

  await userEvent.click(screen.getByRole('tab', { name: 'Codex' }))
  expect(
    screen.getByText(/base_url = "https:\/\/gateway\.example\.com\/v1"/)
  ).toBeVisible()
  expect(screen.getByText(/model = "gpt-6-astra"/)).toBeVisible()

  await userEvent.click(screen.getByRole('tab', { name: 'Claude Code' }))
  expect(
    screen.getByText(/ANTHROPIC_BASE_URL="https:\/\/gateway\.example\.com"/)
  ).toBeVisible()

  await userEvent.click(screen.getByRole('tab', { name: 'OpenCode' }))
  expect(
    screen.getByText(/"baseURL": "https:\/\/gateway\.example\.com\/v1"/)
  ).toBeVisible()

  await userEvent.click(screen.getByRole('tab', { name: 'Hermes' }))
  expect(screen.getByText(/default: Kimi-K2\.5/)).toBeVisible()
  expect(
    screen.getByText(/base_url: "https:\/\/gateway\.example\.com\/v1"/)
  ).toBeVisible()

  await userEvent.click(screen.getByRole('tab', { name: 'DeepSeek Harness' }))
  expect(screen.getByText('npx @deepseek-ai/dsh web')).toBeVisible()
  expect(screen.getByText(/api: openai-completions/)).toBeVisible()
  expect(
    screen.getByText(/baseURL: "https:\/\/gateway\.example\.com\/v1"/)
  ).toBeVisible()
  expect(screen.getByText(/model: Kimi-K2\.5/)).toBeVisible()
})

test('Codex and Claude Code provide their interactive curl setup commands', async () => {
  render(
    <ToolGuides
      gatewayUrl='https://gateway.example.com'
      baseUrl='https://gateway.example.com/v1'
    />
  )

  await userEvent.click(screen.getByRole('tab', { name: 'Codex' }))
  expect(
    screen.getByText(
      'curl -fsSL https://gateway.example.com/scripts/codex-cli-setup.sh | bash -s -- https://gateway.example.com'
    )
  ).toBeVisible()

  await userEvent.click(screen.getByRole('tab', { name: 'Claude Code' }))
  expect(
    screen.getByText(
      'curl -fsSL https://gateway.example.com/scripts/claude-code-setup.sh | bash -s -- https://gateway.example.com'
    )
  ).toBeVisible()
})
