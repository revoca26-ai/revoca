// this file will contain the repository functions for the orgs table
import { query } from '../../db/pool.js'
import { Organization, UpdateOrganization, CreateOrganizationInput } from '../../types/orgs.js'

/**
 * Create a new organization
 * @param data - The organization data (must be a CreateOrganizationInput object)
 * @returns The created organization
 */
async function create(data: CreateOrganizationInput): Promise<Organization> {
    const queryString = `
        INSERT INTO organizations (clerk_org_id, name, plan, timezone, org_type)
        VALUES ($1, $2, COALESCE($3, 'trial'), COALESCE($4, 'UTC'), COALESCE($5, 'team'))
        RETURNING *
    `
    const values = [data.clerk_org_id, data.name, data.plan, data.timezone, data.org_type]
    const result = await query<Organization>(queryString, values)
    return result.rows[0]
}

/**
 * Find an organization by its UUID
 * @param id - The UUID of the organization
 * @returns The organization or null if not found
 */
async function findById(id: string): Promise<Organization | null> {
    const queryString = `
        -- select the organization from the database by its UUID
        SELECT * FROM organizations
        WHERE id = $1
    `
    const values = [id]
    const result = await query<Organization>(queryString, values)
    // checking if the organization is found
    if (result.rowCount === 0) return null
    return result.rows[0]
}

/**
 * Find an organization by its clerk organization id
 * @param clerkOrgId - The clerk organization id
 * @returns The organization or null if not found
 */
async function findByClerkOrgId(clerkOrgId: string): Promise<Organization | null> {
    const queryString = `
        -- select the organization from the database by its clerk organization id
        SELECT * FROM organizations
        WHERE clerk_org_id = $1
    `
    const values = [clerkOrgId]
    const result = await query<Organization>(queryString, values)
    // checking if the organization is found
    if (result.rowCount === 0) return null
    return result.rows[0]
}

/**
 * Update an organization by its UUID
 * @param id - The UUID of the organization
 * @param data - The organization data to be updated (must be a UpdateOrganization object)
 * @returns The updated organization or null if the organization is not found
 */
async function updateById(id: string, data: UpdateOrganization): Promise<Organization | null> {
    const queryString = `
        -- update the organization in the database by its UUID
        UPDATE organizations
        SET 
            -- COALESCE is used to set the values to the new values if they are not undefined
            name = COALESCE($1, name),
            plan = COALESCE($2, plan),
            timezone = COALESCE($3, timezone),
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
    `
    // set the values for the query
    // if the value is not provided it will be set to undefined in the array
    const values = [data.name, data.plan, data.timezone, id]
    const result = await query<Organization>(queryString, values)
    // checking if the organization is found
    if (result.rowCount === 0) return null
    return result.rows[0]
}

/**
 * Export the functions
 * @returns The functions
 */
export default {
    create,
    findById,
    findByClerkOrgId,
    updateById
}