import { NextFunction, Request, Response } from "express";
import { handleSlackMessageEvent } from "./webhooksService.js";
import config from "../../config/config.js";
import crypto from "crypto";

export async function slackWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // ********** verify the signature of the request **********
        const slackSigningSecret = config.SLACK_WEBHOOK_SIGNING_SECRET
        const timestamp = req.headers['x-slack-request-timestamp'] as string
        const reqSignature = req.headers['x-slack-signature'] as string
        // check if the request is more than 5 minutes old to prevent replay attacks
        const slackTimestamp = parseInt(timestamp, 10)
        if (Math.abs(Math.floor(Date.now() / 1000) - slackTimestamp) > 300) {
            res.status(400).json({ message: 'Request is more than 5 minutes old' })
            return
        }
        // 2. form the base string 
        const rawBody = req.rawBody
        const sig_basestring = `v0:${timestamp}:${rawBody}`
        // create the signature sing the hmac algorithm
        const mySignature = "v0=" + crypto.createHmac('sha256', slackSigningSecret).update(sig_basestring).digest('hex')
        // use a hmac compare to compare the signatures recommended by slack rather than comparing the strings directly
        const isValid = crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(reqSignature))
        if (!isValid) {
            res.status(400).json({ message: 'Invalid signature' })
            return
        }
        // ********** verify the signature of the request **********
        // extract the payload from the request
        const payload = req.body
        // extract the team_id from the payload this is the external account id in our database
        const externalAccountId = payload.team_id
        // create a switch case to handle the different types of events
        switch (payload.type) {
            case 'url_verification':
                res.status(200).json({ challenge: payload.challenge })
                return
            case 'event_callback':
                // check if the event type is message 
                if (payload.event.type === 'message') {
                    // send the event to the event handler since slack will wait 3 seconds before trying again which can cause duplicate injection
                    res.status(200).json({ message: 'Event received' })
                    await handleSlackMessageEvent(payload.event, externalAccountId as string)
                    return
                }
                // if the event type is not message, return an error
                res.status(400).json({ message: 'Only message events are supported' })
                return
            default:
                res.status(400).json({ message: 'Invalid event type' })
                return
        }
        
    } catch (error) {
        next(error)
    }
}