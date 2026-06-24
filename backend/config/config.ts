import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// automatic checking if the environment variables are defined and throwing error for that specific variable
const requiredEnvVars: string[] = ['PORT', 'DATABASE_URL', 'NODE_ENV', 'CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'CLERK_WEBHOOK_SIGNING_SECRET', 'ENCRYPTION_KEY']

requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
        throw new Error(`${envVar} is not defined`)
    }
})

// creating an inteface for the config object
interface Config {
    PORT: number
    DATABASE_URL: string
    NODE_ENV: string 
    CLERK_PUBLISHABLE_KEY: string
    CLERK_SECRET_KEY: string
    CLERK_WEBHOOK_SIGNING_SECRET: string
    ENCRYPTION_KEY: string
}

// creating the config object
const config: Config = {
    PORT: parseInt(process.env.PORT!, 10),
    DATABASE_URL: process.env.DATABASE_URL!,
    NODE_ENV: process.env.NODE_ENV!,
    CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY!,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
    CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET!,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!
}

// exporting the config object
export default config