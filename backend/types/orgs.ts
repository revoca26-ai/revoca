// this file will contain the interfaces for the orgs table
export interface Organization {
    id: string, // uuid are strings in the database
    clerk_org_id: string, // clerk organization id
    name: string, // name of the organization
    plan: string, // trial, starter, pro
    timezone: string, // iana timezone for digest delivery
    org_type: 'personal' | 'team' // type of the organization
    created_at: Date, // timestamptz are dates in the TS
    updated_at: Date // timestamptz are dates in the TS
}

// create a interface to update an organization
export interface UpdateOrganization {
    name?: string, // name of the organization
    plan?: string, // trial, starter, pro
    timezone?: string, // iana timezone for digest delivery
}

// create a interface to create an organization
export interface CreateOrganizationInput {
    clerk_org_id: string, // clerk organization id
    name: string, // name of the organization
    plan?: string, // trial, starter, pro
    timezone?: string // iana timezone for digest delivery
    org_type?: 'personal' | 'team' // type of the organization
}

