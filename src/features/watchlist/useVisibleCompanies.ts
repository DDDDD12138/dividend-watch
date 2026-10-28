import { useState } from 'react'
import { sameOrder } from './order'

// Follow preferences are saved immediately; the covered list applies them on return.
export function useVisibleCompanies(codes: string[], overviewOpen: boolean) {
  const [visible, setVisible] = useState(codes)
  if (!overviewOpen && !sameOrder(visible, codes)) {
    setVisible(codes)
    return codes
  }
  return visible
}
