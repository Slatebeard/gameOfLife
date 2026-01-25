import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const STATS_FILE = './data/stats.json'

function loadStats() {
    try {
        if (existsSync(STATS_FILE)) {
            return JSON.parse(readFileSync(STATS_FILE, 'utf-8'))
        }
    } catch (error) {
        console.error('Failed to load stats:', error)
    }
    return {
        lastWinner: { name: null, color: null, date: null },
        mostPlayedPalette: { name: null, count: 0 },
        mostPlayedCategory: { name: null, count: 0 },
        highestScore: { name: null, color: null, count: 0, date: null },
        paletteCounts: {},
        categoryCounts: {},
        gamesPlayed: 0
    }
}

function saveStats(stats) {
    try {
        writeFileSync(STATS_FILE, JSON.stringify(stats, null, 4))
    } catch (error) {
        console.error('Failed to save stats:', error)
    }
}

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

app.get('/api/stats', (c) => {
    const stats = loadStats()
    return c.json(stats)
})

app.post('/api/game-end', async (c) => {
    const body = await c.req.json()
    const { winner, palette, category } = body

    const stats = loadStats()

    // Update games played
    stats.gamesPlayed++

    // Update last winner
    if (winner) {
        stats.lastWinner = {
            name: winner.name,
            color: winner.color,
            date: new Date().toISOString()
        }

        // Check if this is the highest score ever
        if (winner.count > stats.highestScore.count) {
            stats.highestScore = {
                name: winner.name,
                color: winner.color,
                count: winner.count,
                date: new Date().toISOString()
            }
        }
    }

    // Update palette counts
    if (palette) {
        stats.paletteCounts[palette] = (stats.paletteCounts[palette] || 0) + 1

        // Recalculate most played palette
        let maxPalette = null
        let maxPaletteCount = 0
        for (const [name, count] of Object.entries(stats.paletteCounts)) {
            if (count > maxPaletteCount) {
                maxPaletteCount = count
                maxPalette = name
            }
        }
        stats.mostPlayedPalette = { name: maxPalette, count: maxPaletteCount }
    }

    // Update category counts
    if (category) {
        stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1

        // Recalculate most played category
        let maxCategory = null
        let maxCategoryCount = 0
        for (const [name, count] of Object.entries(stats.categoryCounts)) {
            if (count > maxCategoryCount) {
                maxCategoryCount = count
                maxCategory = name
            }
        }
        stats.mostPlayedCategory = { name: maxCategory, count: maxCategoryCount }
    }

    saveStats(stats)
    return c.json({ success: true, stats })
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
