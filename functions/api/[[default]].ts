import '../edgeone-polyfills'
import { createApp } from '../../worker/app'
import { fetchWithSignal } from '../edgeone-fetch'

interface EdgeOneContext {
  request: Request
  waitUntil(task: Promise<unknown>): void
}

const app = createApp({
  fetcher: fetchWithSignal,
  cache: typeof caches === 'undefined' ? undefined : caches.default,
})

// EdgeOne Pages 函数入口：functions/api/[[default]].ts 接管 /api/*，
// functions/api/index.ts 接管裸 /api；静态资源仍由 Pages 直接提供。
export const onRequest = (context: EdgeOneContext) => app.fetch(context.request)
