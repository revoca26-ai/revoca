import { User } from "./users.js"
// extend the Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: User,
            clerkUserId?: string
        }
    }
}
