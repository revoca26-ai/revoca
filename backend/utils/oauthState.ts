import { NewOauthState, ConsumedOauthState, OAuthState } from "../types/oAuth.js";
import { query } from "../db/pool.js";
import crypto from "crypto";
import { AppError } from "../types/AppError.js";

/**
 * Create a new OAuth state
 * @param newOauthState - The new OAuth state
 * @returns The state
 */
export async function createOauthState(newOauthState: NewOauthState): Promise<string> {
    // destructure the newOauthState
    const {org_id, user_id, provider, redirect_path } = newOauthState;
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    // now we need to run a while loop to check if the state already exists by checking if the query gives a 23505 error
    while (true) {
        try {
            // create a random state
            const state = crypto.randomBytes(32).toString('hex');
            const queryString = `INSERT INTO oauth_states (state, org_id, user_id, provider, redirect_path, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`;
            const values = [state, org_id, user_id, provider, redirect_path, expires_at];
            await query(queryString, values);
            return state;
        } catch (err) {
            if (err instanceof Error && 'code' in err && err.code === '23505') continue;
            const message = err instanceof Error ? err.message : 'Failed to create OAuth state';
            throw new AppError(500, 'INTERNAL_ERROR', `Failed to create OAuth state: ${message}`);
        }
    }
}

/**
 * Consume an OAuth state
 * @param state - The state to consume
 * @returns The consumed OAuth state
 */
export async function consumeOauthState(state: string): Promise<ConsumedOauthState> {
    // soft delete the oauth state by setting the consumed_at column to the current timestamp
    const queryString = `UPDATE oauth_states SET consumed_at = NOW() WHERE state = $1 AND expires_at > NOW() AND consumed_at IS NULL RETURNING *`;
    const values = [state];
    const result = await query<OAuthState>(queryString, values);
    if (result.rows.length === 0) {
        throw new AppError(400, 'OAUTH_STATE_INVALID', 'Invalid or expired OAuth state');
    }
    const { org_id, user_id, provider, redirect_path } = result.rows[0];
    return { org_id, user_id, provider, redirect_path };
}