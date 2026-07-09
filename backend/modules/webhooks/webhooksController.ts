import { NextFunction, Request, Response } from "express";

export async function slackWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // extract the payload from the request
        const payload = req.body
        // create a switch case to handle the different types of events
        switch (payload.type) {
            case 'url_verification':
                res.status(200).json({ challenge: payload.challenge })
                return
            case 'event_callback':
                // check if the event type is message 
                if (payload.event.type === 'message') {
                    // send the event to the event handler
                    await handleSlackMessageEvent(payload.event)
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