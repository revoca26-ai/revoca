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
}

// interface for Connector
interface Connector {
    getAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<TokenSet>;
}

// exporting 
export type { NewOauthState, ConsumedOauthState, OAuthState, TokenSet, Connector };