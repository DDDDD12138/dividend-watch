import { RotateCw } from 'lucide-react'
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
        <RotateCw className={refreshing ? 'is-spinning' : undefined} />
        <span className="refresh-label">
          刷新<span className="refresh-suffix">中</span>
        </span>
      </span>
    </Button>
  )
}
