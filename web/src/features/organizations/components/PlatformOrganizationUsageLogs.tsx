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
import { UserInfoDialog } from '@/features/usage-logs/components/dialogs/user-info-dialog'
import {
  UsageLogsProvider,
  useUsageLogsContext,
} from '@/features/usage-logs/components/usage-logs-provider'
import { UsageLogsTable } from '@/features/usage-logs/components/usage-logs-table'
import { EmbeddedUsageLogsRouteProvider } from '@/features/usage-logs/route'

function PlatformOrganizationUsageLogsContent(props: {
  organizationID: number
  ownerID: number
}) {
  const { selectedUserId, userInfoDialogOpen, setUserInfoDialogOpen } =
    useUsageLogsContext()

  return (
    <>
      <div className='min-h-[36rem]'>
        <UsageLogsTable
          logCategory='common'
          scopeCurrentUserID={props.ownerID}
        />
      </div>
      <UserInfoDialog
        userId={selectedUserId}
        open={userInfoDialogOpen}
        onOpenChange={setUserInfoDialogOpen}
      />
    </>
  )
}

export function PlatformOrganizationUsageLogs(props: {
  organizationID: number
  ownerID: number
}) {
  return (
    <EmbeddedUsageLogsRouteProvider>
      <UsageLogsProvider organizationID={props.organizationID}>
        <div className='space-y-3'>
          <PlatformOrganizationUsageLogsContent {...props} />
        </div>
      </UsageLogsProvider>
    </EmbeddedUsageLogsRouteProvider>
  )
}
