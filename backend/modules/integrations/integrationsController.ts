import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../types/AppError'

export async function getIntegrations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // get the org id from the request
        const orgId = req.org_id

        // get the integrations from the database
        const integrations = await integrationsRepository.findAllByOrg(orgId)

        // return the integrations
        res.json(integrations)

    } catch (err) {
        // pass error to the error middleware
        next(err)
    }
}