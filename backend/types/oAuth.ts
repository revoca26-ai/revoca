import { Integration, RawDocument } from './integrations.js';
// creat a type to create a new oauth state
type NewOauthState = {
    org_id: string;
    user_id: string;
    provider: string;
    redirect_path: string;
}

// the consumed OAuth state object
type ConsumedOauthState = {
    org_id: string;
    user_id: string;
    provider: string;
    redirect_path: string;
}

// the OAuth state object
type OAuthState = {
    state: string;
    org_id: string;
    user_id: string;
    provider: string;
    redirect_path: string;
    consumed_at: Date | null;
    expires_at: Date;
    created_at: Date;
}

// the token set returned by the OAuth 2.0 provider
type TokenSet = {
    access_token: string;
    refresh_token: string | null;
    expires_at: Date | null;
    // this is the external account id in the database for now it is only used for slack since it has a live webhook to identify org_id
    external_account_id?: string; 
}

type RefreshTokenSet = {
    access_token: string;
    expires_at: Date;
    refresh_token: string | null;
}

// interface for Connector
interface Connector {
    getAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<TokenSet>;
    syncData(integration: Integration): Promise<RawDocument[]>;
    refreshToken(integration: Integration): Promise<RefreshTokenSet | null>;
}

// exporting 
export type { NewOauthState, ConsumedOauthState, OAuthState, TokenSet, RefreshTokenSet, Connector };