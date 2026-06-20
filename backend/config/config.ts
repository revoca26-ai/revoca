import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// automatic checking if the environment variables are defined and throwing error for that specific variable
const requiredEnvVars: string[] = ['PORT', 'DATABASE_URL', 'NODE_ENV']

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
}

// creating the config object
const config: Config = {
    PORT: parseInt(process.env.PORT!, 10),
    DATABASE_URL: process.env.DATABASE_URL!,
    NODE_ENV: process.env.NODE_ENV!
}

// exporting the config object
export default config