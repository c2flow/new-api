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
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, test, vi } from 'vitest'

import { Profile } from '../index'

vi.mock('@/components/layout', () => ({
  Main: (props: { children: ReactNode }) => <main>{props.children}</main>,
}))
vi.mock('@/components/page-transition', () => ({
  CardStaggerContainer: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
  CardStaggerItem: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      checkin_enabled: true,
      turnstile_check: false,
      turnstile_site_key: '',
    },
  }),
}))
vi.mock('../hooks', () => ({
  useProfile: () => ({
    profile: null,
    loading: false,
    refreshProfile: vi.fn(),
  }),
}))
vi.mock('../components/checkin-calendar-card', () => ({
  CheckinCalendarCard: () => <div>Check-in calendar</div>,
}))
vi.mock('../components/language-preferences-card', () => ({
  LanguagePreferencesCard: () => <div>Language preferences</div>,
}))
vi.mock('../components/login-sessions-card', () => ({
  LoginSessionsCard: () => <div>Login sessions</div>,
}))
vi.mock('../components/profile-header', () => ({
  ProfileHeader: () => <div>Profile header</div>,
}))
vi.mock('../components/profile-security-card', () => ({
  ProfileSecurityCard: () => <div>Profile security</div>,
}))
vi.mock('../components/profile-settings-card', () => ({
  ProfileSettingsCard: () => <div>Profile settings</div>,
}))
vi.mock('../components/sidebar-modules-card', () => ({
  SidebarModulesCard: () => <div>Sidebar modules</div>,
}))
vi.mock('../components/passkey-card', () => ({
  PasskeyCard: () => <div>Passkey login</div>,
}))
vi.mock('../components/two-fa-card', () => ({
  TwoFACard: () => <div>Two-factor authentication</div>,
}))

test('personal profile omits standalone security and sidebar cards', () => {
  render(<Profile />)

  const profileSettings = screen.getByText('Profile settings')
  const checkinCalendar = screen.getByText('Check-in calendar')
  expect(profileSettings).toBeVisible()
  expect(checkinCalendar).toBeVisible()
  expect(checkinCalendar.parentElement).toBe(profileSettings.parentElement)
  expect(screen.queryByText('Sidebar modules')).toBeNull()
  expect(screen.queryByText('Passkey login')).toBeNull()
  expect(screen.queryByText('Two-factor authentication')).toBeNull()
})
