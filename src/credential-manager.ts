import {
    argValidator as _argValidator,
    schemaHelper as _schemaHelper
} from '@vamship/arg-utils';
import _loggerProvider from '@vamship/logger';
import { Promise } from 'bluebird';
import _execa from 'execa';
import _fetch from 'isomorphic-fetch';
import _url from 'url';
import dockerCredentialsSchema from './docker-credentials-schema';
import { IContainerCredentials, ILogger } from './types';

const _checkDockerCredentialsSchema = _schemaHelper.createSchemaChecker(
    dockerCredentialsSchema,
    'Container credentials do not conform to expected schema'
);

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
     * Fetches and validates credentials for access to private container
     * repositories.
     *
     * @param repoUri The URI of the private repository for which credentials
     *        have to be fetched.
     */
    public fetchContainerCredentials(
        repoUri: string
    ): Promise<IContainerCredentials> {
        _argValidator.checkString(repoUri, 1, 'Invalid repoUri (arg #1)');

        this._logger.debug(
            'Fetching credentials for private container repository',
            {
                repoUri
            }
        );
        this._logger.trace(_fetch.toString());

        return _fetch(this._endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: this._authToken
            },
            body: JSON.stringify({
                kind: 'container',
                resourceId: repoUri
            })
        })
            .then((response) => {
                this._logger.trace('Parsing repository credentials');
                return response.json().then(undefined, (err) => {
                    this._logger.error(err);
                    throw new Error(
                        'Error parsing credential provider response'
                    );
                });
            })
            .then((credentials) => {
                this._logger.trace('Verifying credential schema');
                _checkDockerCredentialsSchema(credentials, true);

                return credentials;
            })
            .catch((err) => {
                this._logger.error(
                    err,
                    `Error fetching credentials for private container repository: [${repoUri}]`
                );
                throw err;
            });
    }

    /**
     * Applies container credentials to a service account by creating a
     * kubernetes secret and patching it into the service account spec.
     *
     * @param secretName The name of the secret to create
     * @param containerCredentials The credentials to use when creating the
     *        secret.
     * @param namespace The namespace in which the secret resides.
     */
    public createImagePullSecret(
        secretName: string,
        containerCredentials: IContainerCredentials,
        namespace?: string
    ): Promise {
        _argValidator.checkString(secretName, 1, 'Invalid secretName (arg #1)');
        _argValidator.checkObject(
            containerCredentials,
            'Invalid containerCredentials (arg #2)'
        );
        _argValidator.checkString(
            containerCredentials.server,
            1,
            'Invalid server (containerCredentials.server)'
        );
        _argValidator.checkString(
            containerCredentials.username,
            1,
            'Invalid username (containerCredentials.username)'
        );
        _argValidator.checkString(
            containerCredentials.password,
            1,
            'Invalid password (containerCredentials.password)'
        );
        _argValidator.checkString(
            containerCredentials.email,
            1,
            'Invalid email (containerCredentials.email)'
        );
        if (typeof namespace !== 'undefined') {
            _argValidator.checkString(
                namespace,
                1,
                'Invalid namespace (arg #3)'
            );
        }

        return Promise.resolve()
            .then(() => {
                this._logger.debug('Deleting secret', {
                    secret: secretName
                });

                const args = ['delete', 'secret', '--ignore-not-found'];

                if (typeof namespace !== 'undefined') {
                    args.push(`--namespace=${namespace}`);
                }

                args.push(secretName);
                this._logger.trace('Delete secret args', {
                    args
                });

                return _execa('kubectl', args)
                    .catch((err) => {
                        this._logger.error(err);
                        throw new Error(
                            `Error deleting secret: [${secretName}]`
                        );
                    })
                    .then(() => {
                        this._logger.info('Secret deleted', {
                            secret: secretName
                        });
                    });
            })
            .then(() => {
                this._logger.debug('Creating secret', {
                    secret: secretName
                });
                const args = ['create', 'secret', 'docker-registry'];

                if (typeof namespace !== 'undefined') {
                    args.push(`--namespace=${namespace}`);
                }

                [
                    secretName,
                    `--docker-server=${containerCredentials.server}`,
                    `--docker-username=${containerCredentials.username}`,
                    `--docker-password=${containerCredentials.password}`,
                    `--docker-email=${containerCredentials.email}`
                ].forEach((arg) => args.push(arg));

                this._logger.trace('Create secret args', {
                    args
                });
                return _execa('kubectl', args)
                    .catch((err) => {
                        this._logger.error(err);
                        throw new Error(
                            `Error creating secret: [${secretName}]`
                        );
                    })
                    .then(() => {
                        this._logger.info('Secret created', {
                            secret: secretName
                        });
                    });
            })
            .catch((err) => {
                this._logger.error(
                    err,
                    `Error updating image pull secret: [${secretName}, ${namespace}]`
                );
                throw err;
            });
    }

    /**
     * Patches a service account with a list of image pull secrets.
     *
     * @param serviceAccount The service account to which the secrets will
     *        be patched.
     * @param secrets An array of secrets to patch to the service account
     * @param namespace An optional namespace parameter that identifies the
     *        namespace in which the service account resides.
     */
    public applyImagePullSecrets(
        serviceAccount: string,
        secrets: string[],
        namespace?: string
    ) {
        _argValidator.checkString(
            serviceAccount,
            1,
            'Invalid serviceAccount (arg #1)'
        );
        _argValidator.checkArray(secrets, 'Invalid secrets (arg #2)');
        if (typeof namespace !== 'undefined') {
            _argValidator.checkString(
                namespace,
                1,
                'Invalid namespace (arg #3)'
            );
        }
        this._logger.debug('Patching service account', {
            serviceAccount
        });
        const patch = JSON.stringify({
            imagePullSecrets: secrets.map((name) => ({ name }))
        });

        const args = ['patch', 'serviceaccount'];
        if (typeof namespace !== 'undefined') {
            args.push(`--namespace=${namespace}`);
        }
        [serviceAccount, `-p='${patch}'`].forEach((arg) => args.push(arg));

        this._logger.trace('Patch service account args', {
            args
        });
        return _execa('kubectl', args)
            .then(() => {
                this._logger.info('Service account patched', {
                    serviceAccount
                });
            })
            .catch((err) => {
                this._logger.error(err);
                throw new Error(
                    `Error applying secrets to: [${serviceAccount}, ${namespace}]`
                );
            });
    }
}
