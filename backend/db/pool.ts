import pg, {  Pool, QueryResult, QueryResultRow } from 'pg'
import config from '../config/config.js'

// extract the database url from the config
const databaseUrl: string = config.DATABASE_URL

// create a pool
const pool: Pool = new pg.Pool({
    connectionString: databaseUrl,
    // production pool options
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
})

// helper function to query the database
async function query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    // query the database
    return await pool.query<T>(text, params)
}
// export pool and query helper for the rest of the app
export { pool, query }  