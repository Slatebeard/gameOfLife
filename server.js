import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { readFileSync } from 'fs'

const app = new Hono()

// In-memory store for current game scores
let currentScores = {
    teams: [
        { name: 'Team 1', color: '#E63946', count: 0 },
        { name: 'Team 2', color: '#457B9D', count: 0 },
        { name: 'Team 3', color: '#2A9D8F', count: 0 },
        { name: 'Team 4', color: '#F4A261', count: 0 }
    ],
    event: 'NO EVENT',
    lastUpdated: null
}

// Helper to check if request is from localhost
function isLocalhost(c) {
    const connInfo = getConnInfo(c)
    const ip = connInfo?.remote?.address || ''
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '::ffff:127.0.0.1'
}

// API endpoint to receive score updates from main game
app.post('/api/scores', async (c) => {
    const body = await c.req.json()
    currentScores = {
        ...body,
        lastUpdated: new Date().toISOString()
    }
    return c.json({ success: true })
})

// API endpoint to get current scores
app.get('/api/scores', (c) => {
    return c.json(currentScores)
})

// Score page - accessible from network
app.get('/score', (c) => {
    const html = readFileSync('./public/standings.html', 'utf-8')
    return c.html(html)
})

// Block non-localhost from main game
app.use('/*', async (c, next) => {
    const path = c.req.path

    // Allow these paths from anywhere
    if (path === '/score' || path.startsWith('/api/')) {
        return next()
    }

    // Block main game from non-localhost
    if (!isLocalhost(c)) {
        return c.text('Access denied. Use /score to view standings.', 403)
    }

    return next()
})

// Serve static files from public directory
app.use('/*', serveStatic({ root: './public' }))

const port = 3000
console.log(`Server running at http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
