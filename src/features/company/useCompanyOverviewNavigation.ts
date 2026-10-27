import { useLocation, useNavigate, useSearchParams } from 'react-router'

export function useCompanyOverviewNavigation() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const requestedCompany = searchParams.get('company')
  const overviewCode =
    requestedCompany && /^\d{6}$/.test(requestedCompany)
      ? requestedCompany
      : null
  function openOverview(code: string) {
    const next = new URLSearchParams(searchParams)
    next.set('company', code)
    setSearchParams(next, { state: { overviewFromList: true } })
  }
  function closeOverview() {
    if (location.state?.overviewFromList === true) {
      navigate(-1)
    } else {
      // A directly opened URL has no list entry to go back to.
      const next = new URLSearchParams(searchParams)
      next.delete('company')
      setSearchParams(next, { replace: true })
    }
  }
  return { overviewCode, openOverview, closeOverview }
}
