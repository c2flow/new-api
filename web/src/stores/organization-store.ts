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
import { create } from 'zustand'

import type {
  OrganizationContext,
  OrganizationMembership,
} from '@/features/organizations/types'

type OrganizationState = {
  userID: number | null
  activeOrgID: number | null
  latestMembershipID: number | null
  membershipSelectionReady: boolean
  epoch: number
  context: OrganizationContext | null
  bindUser: (userID: number) => void
  select: (orgID: number | null) => void
  syncMemberships: (
    organizations: Pick<
      OrganizationMembership,
      'id' | 'status' | 'membership_id'
    >[]
  ) => void
  setContext: (context: OrganizationContext, epoch: number) => void
}

// Persist the selected ID and the newest membership already seen for each
// global login identity. Roles, names and permissions always come from the server.
export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  userID: null,
  activeOrgID: null,
  latestMembershipID: null,
  membershipSelectionReady: false,
  epoch: 0,
  context: null,
  bindUser: (userID) => {
    if (get().userID === userID) return
    let activeOrgID: number | null = null
    let latestMembershipID: number | null = null
    try {
      const stored = localStorage.getItem(`new-api:org:v2:${userID}`)
      if (stored) {
        const parsed = JSON.parse(stored) as unknown
        if (parsed && typeof parsed === 'object') {
          const selection = parsed as Record<string, unknown>
          if (
            Number.isSafeInteger(selection.active_org_id) &&
            Number(selection.active_org_id) > 0
          ) {
            activeOrgID = Number(selection.active_org_id)
          }
          if (
            Number.isSafeInteger(selection.latest_membership_id) &&
            Number(selection.latest_membership_id) >= 0
          ) {
            latestMembershipID = Number(selection.latest_membership_id)
          }
        }
      } else {
        const legacy = Number(localStorage.getItem(`new-api:org:v1:${userID}`))
        if (Number.isSafeInteger(legacy) && legacy > 0) activeOrgID = legacy
      }
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    set({
      userID,
      activeOrgID,
      latestMembershipID,
      membershipSelectionReady: false,
      context: null,
      epoch: get().epoch + 1,
    })
  },
  select: (activeOrgID) => {
    const state = get()
    try {
      localStorage.setItem(
        `new-api:org:v2:${state.userID}`,
        JSON.stringify({
          active_org_id: activeOrgID,
          latest_membership_id: state.latestMembershipID ?? 0,
        })
      )
      localStorage.removeItem(`new-api:org:v1:${state.userID}`)
    } catch {
      /* The current session still works without persistence. */
    }
    set({ activeOrgID, context: null, epoch: state.epoch + 1 })
  },
  syncMemberships: (organizations) => {
    const state = get()
    const latestOrganization = organizations.find(
      (organization) => organization.status === 1
    )
    const latestMembershipID = latestOrganization?.membership_id ?? 0
    const latestOrganizationID = latestOrganization?.id ?? null
    const joinedNewOrganization =
      state.latestMembershipID === null ||
      latestMembershipID > state.latestMembershipID
    const activeOrgID =
      joinedNewOrganization && latestOrganizationID !== null
        ? latestOrganizationID
        : state.activeOrgID
    const storedMembershipID = Math.max(
      state.latestMembershipID ?? 0,
      latestMembershipID
    )
    if (
      activeOrgID === state.activeOrgID &&
      storedMembershipID === state.latestMembershipID &&
      state.membershipSelectionReady
    ) {
      return
    }
    try {
      localStorage.setItem(
        `new-api:org:v2:${state.userID}`,
        JSON.stringify({
          active_org_id: activeOrgID,
          latest_membership_id: storedMembershipID,
        })
      )
      localStorage.removeItem(`new-api:org:v1:${state.userID}`)
    } catch {
      /* The current session still works without persistence. */
    }
    set({
      activeOrgID,
      latestMembershipID: storedMembershipID,
      membershipSelectionReady: true,
      context: activeOrgID === state.activeOrgID ? state.context : null,
      epoch: activeOrgID === state.activeOrgID ? state.epoch : state.epoch + 1,
    })
  },
  setContext: (context, epoch) => {
    if (
      get().epoch !== epoch ||
      context.organization.id !== get().activeOrgID
    ) {
      return
    }
    set({ context })
  },
}))
