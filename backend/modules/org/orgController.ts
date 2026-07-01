import { Request, Response, NextFunction } from "express"
import { clerkClient } from "@clerk/express"

export async function createOrg(req: Request, res: Response, next: NextFunction) {
    try {
        const clerkUserId = req.clerkUserId!
        const { name, org_type } = req.body
        if (!name || !org_type) {
            return res.status(400).json({ error: 'name and org_type are required' })
        }

        if (!['personal', 'team'].includes(org_type)) {
            return res.status(400).json({ error: 'org_type must be personal or team' })
        }

        const org = await clerkClient.organizations.createOrganization({
            name,
            createdBy: clerkUserId,
            publicMetadata: { org_type }
        })

        res.status(201).json({ success: true, clerkOrgId: org.id })
    } catch (error) {
        next(error)
    }
}