import { Request, Response, NextFunction } from 'express'
import { AppError } from '../types/AppError.js'

export const requiredRoles = (allowedRoles: string[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        // extract the role from the request
        const role = req.user?.role;
        
        if (!role || !allowedRoles.includes(role)) {
            return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
        }

        next();
    }
}