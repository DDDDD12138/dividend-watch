import { Hono } from 'hono'

const app = new Hono()

app.get('/api/health', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ status: 'ok', service: 'dividend-watch' })
})

app.notFound((c) => c.json({ error: 'NOT_FOUND' }, 404))

export default app
