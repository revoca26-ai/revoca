// handle the slack message event
export async function handleSlackMessageEvent(event: any): Promise<void> {
    try {
        // extract the event data
        const { text, user, channel, ts } = event
        // log the event data
        console.log(`Received message event from user ${user} in channel ${channel} at timestamp ${ts} with text: ${text}`)
    } catch (error) {
        console.error(`Error handling slack message event: ${error}`)
        throw error
    }
}