import { CreateUser, UpdateUser, User } from '../../types/users.js'
import { query } from '../../db/pool.js'

/**
 * Create a new user
 * @param orgId - The organization id to link the user to
 * @param data - The user data (must be a CreateUser object)
 * @returns The created user
 */
async function create(orgId: string, data: CreateUser): Promise<User> {
    const queryString = `
        -- insert the user into the database
        INSERT INTO users (clerk_user_id, org_id, email, role)
        VALUES ($1, $2, $3, COALESCE($4, 'member'))
        RETURNING *
    `
    const values = [data.clerk_user_id, orgId, data.email, data.role]
    const result = await query<User>(queryString, values)
    return result.rows[0]
}

/**
 * Find a user by user id and organization id
 * @param userId - The user id
 * @param orgId - The organization id
 * @returns The user or null if not found
 */
async function findByIdAndOrgId(userId: string, orgId: string): Promise<User | null> {
    const queryString = `
        -- select the user from the database by its user id and organization id
        SELECT * FROM users WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
    `
    const values = [userId, orgId]
    const result = await query<User>(queryString, values)
    // checking if the user is found
    if (result.rowCount === 0) return null
    return result.rows[0]
}

/**
 * Find a user with its clerk user id
 * @param clerkUserId - The clerk user id
 * @returns The user or null if not found
 */
async function findByClerkUserId(clerkUserId: string): Promise<User | null> {
    const queryString = `
        -- select the user from the database by its clerk user id
        SELECT * FROM users WHERE clerk_user_id = $1 AND deleted_at IS NULL
    `
    const values = [clerkUserId]
    const result = await query<User>(queryString, values)
    // checking if the user is found
    if (result.rowCount === 0) return null
    return result.rows[0]
}

/**
 * Soft delete a user by their id and organization id.
 * Used when a member leaves the organization. The row is kept
 * so existing query history still references a valid user.
 * @param userId - The user id
 * @param orgId - The organization id
 * @returns true if a user was deleted, false if no matching active user was found
 */
async function deleteById(userId: string, orgId: string): Promise<boolean> {
    const queryString = `
        UPDATE users
        SET deleted_at = NOW()
        WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
    `
    const values = [userId, orgId]
    const result = await query(queryString, values)
    return result.rowCount! > 0
}

/**
 * Update a user's role by their id and organization id.
 * @param userId - The user id
 * @param orgId - The organization id
 * @param data - The user data to update in the updateUser object
 * @returns The updated user
 */
async function updateById(userId: string, orgId: string, data: UpdateUser): Promise<User | null> {
    const queryString = `
        UPDATE users
        SET role = COALESCE($1, role)
        WHERE id = $2 AND org_id = $3 AND deleted_at IS NULL
        RETURNING *
    `
    const values = [data.role, userId, orgId]
    const result = await query<User>(queryString, values)
    // checking if the user is found
    if (result.rowCount === 0) return null
    return result.rows[0]
}

/**
 * Find all users by organization id
 * @param orgId - The organization id
 * @returns The users or an empty array if no users are found
 */
async function findAllByOrgId(orgId: string): Promise<User[]> {
    const queryString = `
        SELECT * FROM users WHERE org_id = $1 AND deleted_at IS NULL
    `
    const values = [orgId]
    const result = await query<User>(queryString, values)
    return result.rows
}

// export the functions
export default {
    create,
    findByIdAndOrgId,
    findByClerkUserId,
    deleteById,
    updateById,
    findAllByOrgId
}