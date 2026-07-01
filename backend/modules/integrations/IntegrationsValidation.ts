import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../types/AppError.js'

const connectIntegrationSchema = z.object({
    body: z.object({
        redirectPath: z.string().min(1),
    }),
    params: z.object({
        provider: z.string().min(1),
    }),
})

export function validateConnectIntegration(req: Request, _res: Response, next: NextFunction) {
    const result = connectIntegrationSchema.safeParse(req)
    if (!result.success) {
        throw new AppError(400, 'INVALID_REQUEST', result.error.issues[0].message)
    }
    next()
}

const deleteIntegrationSchema = z.object({
    params: z.object({
        provider: z.string().min(1),
    }),
})

export function validateDeleteIntegration(req: Request, res: Response, next: NextFunction) {
    const result = deleteIntegrationSchema.safeParse(req)
    if (!result.success) {
        throw new AppError(400, 'INVALID_REQUEST', result.error.issues[0].message)
    }
    next()
}