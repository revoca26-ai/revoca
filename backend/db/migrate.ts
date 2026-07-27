import { logger } from '../utils/logger.js';
import dotenv from 'dotenv'
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// load up the environment variable in one file 
dotenv.config()

// get the database string
const DATABASE_URL: string = process.env.DATABASE_URL!

// checking if the database actually exists
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
}

// create the database client
const client = new Client({ connectionString: DATABASE_URL })

// using a try block to migrate each of the sql files in the migrations folder
try {
    await client.connect()

    // Create the migrations tracking table if it doesn't exist
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `)

    // Get already applied migrations
    const { rows } = await client.query('SELECT id FROM schema_migrations')
    const applied = new Set(rows.map(row => row.id))

    // get the directory path of the current file in ESM
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)

    // getting the migrations folder path
    const migrationsDir = path.join(__dirname, '../migrations')

    // reading all files in the migrations folder
    const files = fs.readdirSync(migrationsDir)

    // filter and sort the sql files
    const sqlFiles = files.filter(file => file.endsWith('.sql')).sort()

    // read the content of each sql file and run the query if not already applied
    for (const file of sqlFiles) {
        if (applied.has(file)) {
            logger.info(`Skipping: ${file} (already applied)`)
            continue
        }

        const filePath = path.join(migrationsDir, file)
        
        // extracting the content as a text string (utf8)
        const fileContent = fs.readFileSync(filePath, 'utf8')
        
        logger.info(`Migrating: ${file}`)
        
        // Run migration and record its execution in a transaction
        await client.query('BEGIN')
        try {
            await client.query(fileContent)
            await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file])
            await client.query('COMMIT')
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        }
    }

    logger.info('Migrations finished successfully!')
} catch (error) {
    logger.error({ err: error }, 'Migration runner failed:')
    process.exit(1)
} finally {
    await client.end()
}

