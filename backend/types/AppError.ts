// this is files creates a custom error class for the application
export class AppError extends Error {
    // readonly properties are set in the constructor and cannot be changed after creation
    public readonly statusCode: number;
    public readonly code: string;

    constructor(statusCode = 500, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred') {
        // call the parent constructor with the message
        super(message);
        // set the properties
        this.statusCode = statusCode;
        this.code = code;

        // ensuring that the AppError name is used by TS instead of Error
        this.name = this.constructor.name;
        // ensuring that the stack trace is not of the AppError class but of the actual error
        Error.captureStackTrace(this, this.constructor);
        // ensuring that TS get the correct instance of the AppError class
        Object.setPrototypeOf(this, new.target.prototype);

    }
}