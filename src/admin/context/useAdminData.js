import { useContext } from 'react'
import { AdminDataContext } from './AdminDataContext.js'

export function useAdminData() {
  const context = useContext(AdminDataContext)

  if (!context) {
    throw new Error('useAdminData must be used within AdminDataProvider.')
  }

  return context
}
