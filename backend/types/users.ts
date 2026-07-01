// this file will contain the interfaces for the users table
export interface User {
    id: string, // uuid are strings in the database
    clerk_user_id: string, // clerk user id
    org_id: string, // organization id
    email: string, // email of the user
    role: string, // role of the user
    created_at: Date, // timestamptz are dates in the TS
    updated_at: Date // timestamptz are dates in the TS
}

// create an interface to create a user
export interface CreateUser {
    clerk_user_id: string, // clerk user id
    email: string, // email of the user
    role?: string, // role of the user
}

// interface to update the user
export interface UpdateUser {
    role?: string, // role of the user
}