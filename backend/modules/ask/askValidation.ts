import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../types/AppError.js'

// DTO: what POST /ask must look like
const createAskSchema = z.object({
    body: z.object({
        question: z.string().trim().min(3).max(1000),
    }),
})

export type CreateAskSchema = z.infer<typeof createAskSchema>

// create a validation middleware
export const validateCreateAsk = (req: Request, _res: Response, next: NextFunction) => {
    // check if the request body matches the schema
    const result = createAskSchema.safeParse(req)
    if (!result.success) {
        const err = new AppError(400, 'INVALID_REQUEST', result.error.issues[0].message)
        return next(err)
    }
    // if the request body matches the schema then continue to the next middleware
    next()
}