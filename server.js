import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { readFileSync } from 'fs'

const app = new Hono()

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

function isLocalhost(c) {
    const connInfo = getConnInfo(c)
    const ip = connInfo?.remote?.address || ''
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '::ffff:127.0.0.1'
}

app.post('/api/scores', async (c) => {
    const body = await c.req.json()
    currentScores = {
        ...body,
        lastUpdated: new Date().toISOString()
    }
    return c.json({ success: true })
})

app.get('/api/scores', (c) => {
    return c.json(currentScores)
})

app.get('/score', (c) => {
    const html = readFileSync('./public/standings.html', 'utf-8')
    return c.html(html)
})

app.use('/*', async (c, next) => {
    const path = c.req.path

    if (path === '/score' || path.startsWith('/api/')) {
        return next()
    }

    if (!isLocalhost(c)) {
        return c.text('Access denied. Use /score to view standings.', 403)
    }

    return next()
})

app.use('/*', serveStatic({ root: './public' }))

const port = 3000
console.log(`Server running at http://localhost:${port}`)

serve({
    fetch: app.fetch,
    port
})
