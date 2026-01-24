import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'

const app = new Hono()

// Serve static files from public directory
app.use('/*', serveStatic({ root: './public' }))

const port = 3000
console.log(`Server running at http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
