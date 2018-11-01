import { argValidator as _argValidator } from '@vamship/arg-utils';
import _loggerProvider from '@vamship/logger';
import _fetch from 'isomorphic-fetch';
import _url from 'url';
import { ILogger } from './types';

/**
 * Manages credentials for access to resources such as containers stored in
 * private repositories, or secure helm chart repositories
 */
export default class CredentialManager {
    private _endpoint: string;
    private _authToken: string;
    private _logger: ILogger;

    /**
     * @param endpoint The endpoint URL of a credential provider service that
     *        can receive requests, and provide access credentials to specific
     *        resources.
     * @param authToken The authorization token to use when connecting to the
     *        credential provider.
     */
    constructor(endpoint: string, authToken: string) {
        const error = 'Invalid endpoint (arg #1)';
        _argValidator.checkString(endpoint, 1, error);
        const { protocol, hostname } = _url.parse(endpoint);
        _argValidator.checkNumber(
            ['http:', 'https:'].indexOf(protocol || ''),
            0,
            error
        );
        _argValidator.checkString(hostname, 1, error);
        _argValidator.checkString(authToken, 1, 'Invalid authToken (arg #2)');

        this._endpoint = endpoint;
        this._authToken = authToken;
        this._logger = _loggerProvider.getLogger('credential-manager');
        this._logger.trace('CredentialManager initialized', {
            endpoint: this._endpoint
        });
    }

    /**
     * Fetches and applies credentials to a kubernetes secret object, and then
     * patches the secrets into a service account used to instantiate pods.
     *
     * @param kind The kind of credentiuals to obtain.
     * @param resourceId An id that uniquely identifies the resource for which
     *        credentials need to be obtained. For containers, this could be the
     *        container repo.
     */
    public applyCredentials(kind: string, resourceId: string) {
        _argValidator.checkString(kind, 1, 'Invalid kind (arg #1)');
        _argValidator.checkString(resourceId, 1, 'Invalid resourceId (arg #2)');

        this._logger.debug('Fetching credentials for resource', {
            kind,
            resourceId
        });

        return _fetch(this._endpoint, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                authorization: this._authToken
            }
        })
            .then(() => {
                this._logger.info('Credentials fetched for resource', {
                    kind,
                    resourceId
                });
                // TODO: More functionality is required
                return true;
            })
            .catch((err) => {
                this._logger.error(
                    err,
                    `Error fetching credentials for resource: [${resourceId}]`
                );
                throw err;
            });
    }
}
