import { ArrowLeft } from 'lucide-react'
import { overviewReturnPath } from './navigation'
import { Link, useLocation, useNavigate } from 'react-router'

export function CompanyReturnLink({ code }: { code: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const returnTo = overviewReturnPath(location.state, code)
  return (
    <Link
      className="history-back"
      to={returnTo ?? '/'}
      onClick={(event) => {
        if (
          !returnTo ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return
        // Return to the actual overview entry, rather than pushing a duplicate
        // that would reopen the drawer immediately after the user closes it.
        event.preventDefault()
        navigate(-1)
      }}
    >
      <ArrowLeft />
      {returnTo ? '返回公司概览' : '返回关注列表'}
    </Link>
  )
}
