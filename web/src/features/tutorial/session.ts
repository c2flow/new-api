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
import type { OrganizationTutorialRole, TutorialTrackID } from './types'

export const TUTORIAL_SESSION_KEY = 'new-api:tutorial:active:v2'
export const TUTORIAL_SESSION_EVENT = 'new-api:tutorial-session'
export const TUTORIAL_API_KEY_CREATED_EVENT = 'new-api:tutorial-api-key-created'
export const TUTORIAL_API_KEY_COPIED_EVENT = 'new-api:tutorial-api-key-copied'

export type TutorialSession = {
  trackID: TutorialTrackID
  organizationRole?: OrganizationTutorialRole
  stepIndex: number
  requestStartedAt?: number
}

export function readTutorialSession(): TutorialSession | null {
  try {
    const value = window.sessionStorage.getItem(TUTORIAL_SESSION_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as TutorialSession
    if (
      !['quickstart', 'organization', 'admin'].includes(parsed.trackID) ||
      !Number.isInteger(parsed.stepIndex) ||
      parsed.stepIndex < 0
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeTutorialSession(session: TutorialSession | null) {
  if (session) {
    window.sessionStorage.setItem(TUTORIAL_SESSION_KEY, JSON.stringify(session))
  } else {
    window.sessionStorage.removeItem(TUTORIAL_SESSION_KEY)
  }
  window.dispatchEvent(new Event(TUTORIAL_SESSION_EVENT))
}
