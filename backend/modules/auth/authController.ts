import { logger } from '../../utils/logger.js';
import { Request, Response } from 'express'
import { Webhook } from 'svix'
import config from '../../config/config.js'
import { handleOrganizationCreated, handleOrganizationMembershipCreated, handleOrganizationMembershipDeleted, handleOrganizationMembershipUpdated } from './authHandler.js'

export async function handleWebhook(req: Request, res: Response)  {
    // grab the svix signature from the headers
    const svixId = req.headers['svix-id'] as string
    const svixTimestamp = req.headers['svix-timestamp'] as string
    const svixSignature = req.headers['svix-signature'] as string
    // check if anyone one of them is missing
    if (!svixId || !svixTimestamp || !svixSignature) {
        return res.status(400).json({
            status: 'error',
            message: 'Missing svix headers'
        })
    }

    // create a new svix client
    const wh = new Webhook(config.CLERK_WEBHOOK_SIGNING_SECRET)

    // verify the svix signature
    let event: any
    try {
        event = wh.verify(req.body, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature
        })
    } catch (error) {
        logger.error({ err: error }, 'Error verifying svix signature:')
        return res.status(400).json({ error: 'Invalid svix signature' })
    }

    // signature is safe now we can trust the payload
    const eventType = event.type
    // switch on the event type
    switch (eventType) {
        case 'organization.created':
            await handleOrganizationCreated(event)
            break
        case 'organizationMembership.created':
            await handleOrganizationMembershipCreated(event)
            break
        case 'organizationMembership.updated':
            await handleOrganizationMembershipUpdated(event)
            break
        case 'organizationMembership.deleted':
            await handleOrganizationMembershipDeleted(event)
            break
        default:
            logger.info(`Unhandled webhook event: ${eventType}`)
    }

    return res.status(200).json({
        received: true
    })
}