// create a error middleware to handle errors
import { Request, Response, NextFunction } from 'express'

// Create an interface for the error object
interface ErrorObject extends Error {
    code?: string,
    statusCode?: number,
}

// creating and exporting a default error middleware
export default function errorMiddleware(err: ErrorObject, _req: Request, res: Response, _next: NextFunction): void {
    // set the values
    let statusCode = err.statusCode || 500;
    let message = err.message || 'An unexpected error occurred';
    let code = err.code || 'INTERNAL_ERROR';

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

    // log the error stack track in the console
    console.error(err.stack);

    // send the response
    res.status(statusCode).json({ error: { code, message } })

}