import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import { query } from './db/pool.js'
import { clerkMiddleware } from '@clerk/express'
import authRouter from './modules/auth/authRouter.js'
import orgRouter from './modules/org/orgRouter.js'
import integrationsRouter from './modules/integrations/integrationsRouter.js'
import webhooksRouter from './modules/webhooks/webhooksRouter.js'
import askRouter from './modules/ask/askRouter.js'
import errorMiddleware from './middlewares/errorHandler.js'
// declare app
const app: Application = express()

// use middleware
// auth router must be placed before the clerk middleware since the webhook does not require authentication
app.use('/api/v1/auth', authRouter)
app.use(clerkMiddleware())
app.use(express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
        // buf is the exact data straight from the client
        req.rawBody = buf
    }
}))
app.use(cors())
app.use('/api/v1/org', orgRouter)
app.use('/api/v1/integrations', integrationsRouter)
app.use('/api/v1/ask', askRouter)
app.use('/api/v1/webhooks', webhooksRouter)
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

// must be last so next(err) from routers (including Zod) returns JSON
app.use(errorMiddleware)

// export app
export default app