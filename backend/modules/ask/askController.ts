import { Request, Response } from 'express'
import { AskEvent, runAskPipeline } from './pipeline.js'

export const createAsk = async (req: Request, res: Response) => {
    // get the org id
    const org_id = req.org_id as string
    // we are getting the question from the request body
    const { question } = req.body
    // set the headers for the event stream to tell the client that this is an event stream
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    })
    // call the pipeline
    const eventStream: AsyncGenerator<AskEvent, void, unknown> = runAskPipeline(org_id, question)
    // run a loop through the event stream
    try {
        for await (const event of eventStream) {
            switch (event.type) {
                case 'status':
                    res.write(`data: ${JSON.stringify({ type: 'status', status: event.status })}\n\n`)
                    break
                case 'token':
                    res.write(`data: ${JSON.stringify({ type: 'token', text: event.text })}\n\n`)
                    break
                case 'sources':
                    res.write(`data: ${JSON.stringify({ type: 'sources', sources: event.sources })}\n\n`)
                    break
                case 'done':
                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
                    res.end()
                    break
                case 'error':
                    res.write(`data: ${JSON.stringify({ type: 'error', message: event.message })}\n\n`)
                    res.end()
                    break
                }
        }
        // close the event stream only if it's open
        if (!res.writableEnded) {
            res.end()
        }
    } catch (error) {
        // close the event stream only if it's open
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'An unknown error occurred' })}\n\n`)
            res.end()
        }
    }
}