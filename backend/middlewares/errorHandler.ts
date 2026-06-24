// create a error middleware to handle errors
import { Request, Response, NextFunction } from 'express'
import { AppError } from '../types/AppError.js'


// creating and exporting a default error middleware
export default function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    // check if the error is an instance of AppError
    if (err instanceof AppError) {
        // extract all the properties from the AppError instance
        const { statusCode, code, message } = err;
        // log the status code
        console.log(err.statusCode)
        // send the response
        res.status(statusCode).json({ error: { code, message } })
        // stop the function from executing further
        return;
    } 

    let code = 'INTERNAL_ERROR';
    let statusCode = 500;
    let message = err.message ?? 'An unexpected error occurred';

    // first we check that 'code' exists in the error object
    if ('code' in err) {
        code = err.code as string;
        // most common postgres error codes
        if (code === '23502') {
            statusCode = 400;
            message = 'Missing required field';
            code = 'MISSING_REQUIRED_FIELD';
        }
        if (code === '23503') {
            statusCode = 404;
            message = 'Resource not found';
            code = 'RESOURCE_NOT_FOUND';
        }
        // indentify the error code for postgrest response
        if (code === '23505') {
            statusCode = 409;
            message = 'Resource already exists';
            code = 'RESOURCE_EXISTS';
        }
    }

    // log the error stack track in the console
    console.error('CRITICAL ERROR: ', err.stack);

    // send the response
    res.status(statusCode).json({ error: { code, message } })
}