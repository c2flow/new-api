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
import { getRouteApi } from '@tanstack/react-router'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { usePlatformView } from '@/features/organizations/platform-view'
import type { NavigateFn } from '@/hooks/use-table-url-state'

const personalRoute = getRouteApi('/_authenticated/usage-logs/$section')
const platformRoute = getRouteApi(
  '/_authenticated/platform/usage-logs/$section'
)

type EmbeddedUsageLogsRoute = {
  useParams: () => { section: 'common' }
  useSearch: () => UsageLogsSearch
  useNavigate: () => NavigateFn
}

type UsageLogsSearch = Record<string, unknown> & {
  startTime?: number
  endTime?: number
  channel?: string
  model?: string
  token?: string
  group?: string
  username?: string
  requestId?: string
  upstreamRequestId?: string
  filter?: string
  type?: string[]
}

const EmbeddedUsageLogsRouteContext =
  createContext<EmbeddedUsageLogsRoute | null>(null)

export function EmbeddedUsageLogsRouteProvider({
  children,
}: {
  children: ReactNode
}) {
  const [search, setSearch] = useState<UsageLogsSearch>({})
  const navigate = useCallback<NavigateFn>((options) => {
    if (options.search === true) return
    const searchUpdate = options.search
    setSearch((previous) => {
      const next =
        typeof searchUpdate === 'function'
          ? searchUpdate(previous)
          : searchUpdate
      return Object.fromEntries(
        Object.entries({ ...previous, ...next }).filter(
          ([, value]) => value !== undefined
        )
      )
    })
  }, [])
  const route = useMemo<EmbeddedUsageLogsRoute>(
    () => ({
      useParams: () => ({ section: 'common' }),
      useSearch: () => search,
      useNavigate: () => navigate,
    }),
    [navigate, search]
  )

  return createElement(
    EmbeddedUsageLogsRouteContext.Provider,
    { value: route },
    children
  )
}

export function useUsageLogsRoute(): EmbeddedUsageLogsRoute {
  const embedded = useContext(EmbeddedUsageLogsRouteContext)
  const platform = usePlatformView()
  return (embedded ??
    (platform
      ? platformRoute
      : personalRoute)) as unknown as EmbeddedUsageLogsRoute
}
