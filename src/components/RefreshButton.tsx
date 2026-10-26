import { Button } from './Button'
import './refresh-button.css'

export function RefreshButton({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <Button
      variant="text"
      className="refresh-button"
      loading={refreshing}
      aria-label={refreshing ? '刷新中' : '刷新'}
      onClick={onRefresh}
    >
      <span className="refresh-content" aria-hidden="true">
        <svg
          className={refreshing ? 'is-spinning' : undefined}
          viewBox="0 0 20 20"
        >
          <path d="M16 8a6 6 0 1 0 0 5M16 3v5h-5" />
        </svg>
        <span className="refresh-label">
          刷新<span className="refresh-suffix">中</span>
        </span>
      </span>
    </Button>
  )
}
