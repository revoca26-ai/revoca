import { logger } from './utils/logger.js';
import app from './app.js'
import config from './config/config.js'
import { pool, query } from './db/pool.js'

// try to connect to the database
// wrapping in a main async function to await the database connection
async function main(): Promise<void> {
  try {
    // query the database for the current time
    const result = await query<{ now: string }>('SELECT NOW()')
    logger.info({ time: result.rows[0].now }, 'Database connected successfully at')
    // check if the role is worker import the worker.ts file and run the worker
    if (config.ROLE === 'worker') {
      import('./worker.js')
      logger.info('Worker started successfully')
      return
    } else if (config.ROLE === 'server') {
      // start the server
      app.listen(config.PORT, (): void => {
        logger.info(`🚀 Server listening on http://localhost:${config.PORT}`)
      })
    } else {
      logger.error('Invalid role, please set the ROLE environment variable to either worker or server')
      process.exit(1)
      return
    }
    // close the server when the process is terminated
    process.on('SIGINT', async (): Promise<void> => {
      await pool.end()
      logger.info('Database connection closed')
      process.exit(0)
    })
    // close the server when the process is terminated
    process.on('SIGTERM', async (): Promise<void> => {
      await pool.end()
      logger.info('Database connection closed')
      process.exit(0)
    })
    // close the server when the process is terminated
    process.on('uncaughtException', async (error): Promise<void> => {
      logger.error({ err: error }, 'Uncaught exception:')
      await pool.end()
      logger.info('Database connection closed')
      process.exit(1)
    })
    process.on('unhandledRejection', async (error): Promise<void> => {
      logger.error({ err: error }, 'Unhandled rejection:')
      await pool.end()
      logger.info('Database connection closed')
      process.exit(1)
    })
  } catch (error) {
    logger.error({ err: error }, 'Error connecting to the database:')
      process.exit(1)
    }
}

// run the main function 
main();

