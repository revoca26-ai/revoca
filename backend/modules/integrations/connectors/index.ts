import { getGoogleAuthUrl, exchangeGoogleCode, syncGoogleData, refreshGoogleToken } from './google.js'
import { getSlackAuthUrl, exchangeSlackCode, syncSlackData, refreshSlackToken } from './slack.js'
import { getGitHubAuthUrl, exchangeGitHubCode, syncGithubData, refreshGithubToken } from './github.js'
import { Connector } from '../../../types/oAuth.js'
import { AppError } from '../../../types/AppError.js'

const connectors: Record<string, Connector> = {
    google: {
        getAuthorizeUrl: getGoogleAuthUrl,
        exchangeCode: exchangeGoogleCode,
        syncData: syncGoogleData,
        refreshToken: refreshGoogleToken,
    },
    slack: {
        getAuthorizeUrl: getSlackAuthUrl,
        exchangeCode: exchangeSlackCode,
        syncData: syncSlackData,
        refreshToken: refreshSlackToken,
    },
    github: {
        getAuthorizeUrl: getGitHubAuthUrl,
        exchangeCode: exchangeGitHubCode,
        syncData: syncGithubData,
        refreshToken: refreshGithubToken,
    },
}

// getConnector function to get a connector by provider name so we can more cleanly handle errors
/**
 * Get a connector by provider name
 * @param provider - The name of the provider
 * @returns The connector
 * @throws AppError if the provider is invalid
 */
function getConnector(provider: string): Connector {
    const connector = connectors[provider]
    if (!connector) {
        throw new AppError(400, 'INVALID_PROVIDER', 'Invalid provider: ' + provider)
    }
    return connector
}

// exporting the getConnector function
export { getConnector }

