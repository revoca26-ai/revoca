import app from './app.js'
import config from './config/config.js'
import { pool, query } from './db/pool.js'

// try to connect to the database
// wrapping in a main async function to await the database connection
async function main(): Promise<void> {
  try {
    // query the database for the current time
    const result = await query<{ now: string }>('SELECT NOW()')
    console.log('Database connected successfully at', result.rows[0].now)
    // check if the role is worker import the worker.ts file and run the worker
    if (config.ROLE === 'worker') {
      import('./worker.js')
      console.log('Worker started successfully')
      return
    } else if (config.ROLE === 'server') {
      // start the server
      app.listen(config.PORT, (): void => {
        console.log(`🚀 Server listening on http://localhost:${config.PORT}`)
      })
    } else {
      console.error('Invalid role, please set the ROLE environment variable to either worker or server')
      process.exit(1)
      return
    }
    // close the server when the process is terminated
    process.on('SIGINT', async (): Promise<void> => {
      await pool.end()
      console.log('Database connection closed')
      process.exit(0)
    })
    // close the server when the process is terminated
    process.on('SIGTERM', async (): Promise<void> => {
      await pool.end()
      console.log('Database connection closed')
      process.exit(0)
    })
    // close the server when the process is terminated
    process.on('uncaughtException', async (error): Promise<void> => {
      console.error('Uncaught exception:', error)
      await pool.end()
      console.log('Database connection closed')
      process.exit(1)
    })
    process.on('unhandledRejection', async (error): Promise<void> => {
      console.error('Unhandled rejection:', error)
      await pool.end()
      console.log('Database connection closed')
      process.exit(1)
    })
  } catch (error) {
    console.error('Error connecting to the database:', error)
      process.exit(1)
    }
}

// run the main function 
main();

