// creat a type to create a new oauth state
type NewOauthState = {
    org_id: string;
    user_id: string;
    provider: string;
    redirect_path: string;
}

type ConsumedOauthState = {
    org_id: string;
    user_id: string;
    provider: string;
}

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
export type { NewOauthState, ConsumedOauthState, OAuthState };