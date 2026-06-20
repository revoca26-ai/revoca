import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import { query } from './db/pool.js'

// declare app
const app: Application = express()

// use middleware
app.use(cors())
app.use(express.json())

// main welcome route
app.get('/', (_req: Request, res: Response): Response => {
    return res.status(200).json({
        status: 'ok',
        message: 'Welcome to the Revoca API'
    })
})

// health check route -> readiness probe
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await query<{ now: string }>('SELECT NOW()')
        res.status(200).json({
            status: 'ok',
            db: 'Database connection is healthy at ' + result.rows[0].now,
        })
    } catch {
        res.status(503).json({
            status: 'degraded',
            db: 'Database connection failed',
        })
    }
})

// healthz route -> liveness probe
app.get('/healthz', (_req: Request, res: Response): void => {
    res.status(200).json({
        status: 'ok',
    })
})

// export app
export default app