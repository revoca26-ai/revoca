import { getGoogleAuthUrl, exchangeGoogleCode } from './google.js'
import { getSlackAuthUrl, exchangeSlackCode } from './slack.js'
import { getGitHubAuthUrl, exchangeGitHubCode } from './github.js'
import { Connector } from '../../../types/oAuth.js'
import { AppError } from '../../../types/AppError.js'

const connectors: Record<string, Connector> = {
    google: {
        getAuthorizeUrl: getGoogleAuthUrl,
        exchangeCode: exchangeGoogleCode,
    },
    slack: {
        getAuthorizeUrl: getSlackAuthUrl,
        exchangeCode: exchangeSlackCode,
    },
    github: {
        getAuthorizeUrl: getGitHubAuthUrl,
        exchangeCode: exchangeGitHubCode,
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

