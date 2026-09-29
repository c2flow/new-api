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
export type TutorialTrackID = 'quickstart' | 'organization' | 'admin'

export type OrganizationTutorialRole = 'owner' | 'admin' | 'member'

export type TutorialStep = {
  id: string
  titleKey: string
  descriptionKey: string
  href: string
  target: string
  advanceOn?:
    | 'click'
    | 'input'
    | 'paste-api-key'
    | 'copy-curl'
    | 'request-log'
    | 'api-key-created'
    | 'api-key-copied'
  inputEvent?: 'input' | 'change'
  minimumInputLength?: number
  code?: 'curl-key' | 'curl-copy' | 'curl-wait'
}

export type TutorialTrack = {
  id: TutorialTrackID
  titleKey: string
  descriptionKey: string
  steps: TutorialStep[]
}
