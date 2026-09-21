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
import { afterEach, beforeEach, expect, test } from 'vitest'

import { useOrganizationStore } from '../organization-store'

const memberships = [
  { id: 20, status: 1, membership_id: 8 },
  { id: 10, status: 1, membership_id: 3 },
]

beforeEach(() => {
  localStorage.clear()
  useOrganizationStore.setState(useOrganizationStore.getInitialState(), true)
})

afterEach(() => {
  useOrganizationStore.setState(useOrganizationStore.getInitialState(), true)
  localStorage.clear()
})

test('a first visit selects the most recently joined organization', () => {
  useOrganizationStore.getState().bindUser(7)
  useOrganizationStore.getState().syncMemberships(memberships)

  expect(useOrganizationStore.getState().activeOrgID).toBe(20)
  expect(useOrganizationStore.getState().membershipSelectionReady).toBe(true)
})

test('an explicit personal selection is kept until a newer membership appears', () => {
  useOrganizationStore.getState().bindUser(7)
  useOrganizationStore.getState().syncMemberships(memberships)
  useOrganizationStore.getState().select(null)

  useOrganizationStore.setState(useOrganizationStore.getInitialState(), true)
  useOrganizationStore.getState().bindUser(7)
  useOrganizationStore.getState().syncMemberships(memberships)
  expect(useOrganizationStore.getState().activeOrgID).toBeNull()

  useOrganizationStore
    .getState()
    .syncMemberships([{ id: 30, status: 1, membership_id: 9 }, ...memberships])
  expect(useOrganizationStore.getState().activeOrgID).toBe(30)
})

test('a legacy saved organization upgrades to the newest joined organization', () => {
  localStorage.setItem('new-api:org:v1:7', '10')
  useOrganizationStore.getState().bindUser(7)
  useOrganizationStore.getState().syncMemberships(memberships)

  expect(useOrganizationStore.getState().activeOrgID).toBe(20)
  expect(localStorage.getItem('new-api:org:v1:7')).toBeNull()
})
