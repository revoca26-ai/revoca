type Integration = {
    id: string,
    org_id: string,
    provider: string,
    status: string,
    access_token_enc: string | null,
    refresh_token_enc: string | null,
    token_expires_at: Date | null,
    scopes: string[] | null,
    external_account_id: string | null,
    sync_cursor: object | null,
    last_synced_at: Date | null,
    error_message: string | null,
    created_at: Date,
    updated_at: Date,
}

// integration provider and statis
type IntegrationList = {
    provider: string,
    status: string,
    scopes: string[] | null,
    last_synced_at: Date | null,
    created_at: Date,
}

type RawDocument = {
    id: string, 
    integrationId: string,
    orgId: string,
    text: string,
    author: string | null,
    timestamp: Date,
    permalink: string | null,
    sourceType: string,
    title: string | null,
}

export { Integration, IntegrationList, RawDocument }