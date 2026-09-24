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
import { useEffect, useState } from 'react'

import type { Vendor } from '../../types'
import { VendorManagementDialog } from './vendor-management-dialog'
import { VendorMutateDialog } from './vendor-mutate-dialog'

type VendorManagementView = 'list' | 'create' | 'edit'

type VendorManagementProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialView?: VendorManagementView
  initialVendor?: Vendor | null
}

export function VendorManagement(props: VendorManagementProps) {
  const [view, setView] = useState<VendorManagementView>(
    props.initialView ?? 'list'
  )
  const [currentVendor, setCurrentVendor] = useState<Vendor | null>(
    props.initialVendor ?? null
  )

  useEffect(() => {
    if (!props.open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView('list')
      setCurrentVendor(null)
    }
  }, [props.open])

  const handleClose = () => {
    setView('list')
    setCurrentVendor(null)
    props.onOpenChange(false)
  }

  const handleEdit = (vendor: Vendor) => {
    setCurrentVendor(vendor)
    setView('edit')
  }

  const handleMutateClose = () => {
    setCurrentVendor(null)
    setView('list')
  }

  return (
    <>
      <VendorManagementDialog
        open={props.open && view === 'list'}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose()
        }}
        onCreate={() => {
          setCurrentVendor(null)
          setView('create')
        }}
        onEdit={handleEdit}
      />
      <VendorMutateDialog
        open={props.open && (view === 'create' || view === 'edit')}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleMutateClose()
        }}
        currentVendor={view === 'edit' ? currentVendor : null}
        onSaved={handleMutateClose}
      />
    </>
  )
}
