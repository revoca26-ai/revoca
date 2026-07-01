import { getAuth } from '@clerk/express'
import { Request, Response, NextFunction } from 'express'

/**
 * This middleware requires a valid clerk user id to be present in the request
 * this is use for authentication for creating a new user or organization in clerk since it does not have a record in the database yet
 * @param req 
 * @param res 
 * @param next 
 * @returns 
 */
export default function requireClerkAuth(req: Request, res: Response, next: NextFunction) {
    // get the clerk user id from the request
    const { userId: clerkUserId } = getAuth(req)
    if (!clerkUserId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    // attach the clerk user id to the request
    req.clerkUserId = clerkUserId
    next()
}