/**
 * @module root.commands.configureHost
 */
import _configProvider from '@vamship/config';
import { args as _args } from '@vamship/error-types';
import _loggerProvider from '@vamship/logger';
import { Promise } from 'bluebird';

import CredentialManager from '../credential-manager';
import Helm from '../helm';
import Manifest from '../manifest';
import Reporter from '../reporter';
import {
    IChartInstallRecord,
    IContainerCredentials,
    IPrivateContainerRepoRecord
} from '../types';

const { ArgError } = _args;
const _logger = _loggerProvider.getLogger('command:apply');

/**
 * Loads manifest data from the file system and returns a promise that reflects
 * the results of the load operation.
 *
 * @private
 * @param manifest Reference to the manifest object.
 */
function _loadManifest(manifest: Manifest): Promise {
    _logger.trace('Loading manifest file');
    return manifest.load().then(
        () => {
            _logger.trace('Manifest file loaded');
        },
        (err) => {
            throw new Error('Error loading manifest file');
        }
    );
}

/**
 * Fetches credentials for repos, and returns a list of credentials for each
 * repo in the list.
 *
 * @private
 * @param manager Reference to the credential manager object that will fetch
 *        and apply credentials.
 * @param repos An array of repositories for which credentials need to be
 *        obtained.
 */
function _fetchContainerCredentials(
    manager: CredentialManager,
    repos: IPrivateContainerRepoRecord[]
): Promise<any[]> {
    _logger.trace('Fetching repository credentials');
    return Promise.map(repos, (repo, index) => {
        _logger.trace('Fetching credentials for container repository', {
            index,
            repository: repo
        });
        return manager.fetchContainerCredentials(repo);
    }).then(
        (data) => {
            _logger.trace('Repository credentials fetched');
            return data;
        },
        (err) => {
            const message = 'Error fetching container credentials';
            _logger.error(err, message);
            throw new Error(message);
        }
    );
}

/**
 * Creates image pull secrets based on a list of secrets.
 *
 * @private
 * @param manager Reference to the credential manager object that will fetch
 *        and apply credentials.
 * @param secrets An array of secrets that need to be created.
 */
function _createImagePullSecrets(
    manager: CredentialManager,
    secrets: Array<{
        secretName: string;
        credentials: IContainerCredentials;
        namespace?: string;
    }>
): Promise<any[]> {
    return Promise.map(secrets, ({ secretName, credentials, namespace }) => {
        _logger.trace('Creating image pull secret', {
            namespace,
            secretName
        });

        return manager.createImagePullSecret(
            secretName,
            credentials,
            namespace
        );
    }).then(
        (data) => {
            _logger.trace('Image pull secrets created');
            return data;
        },
        (err) => {
            const message = 'Error creating image pull secrets';
            _logger.error(err, message);
            throw new Error(message);
        }
    );
}

/**
 * Applies the image pull secrets to the target service accounts.
 *
 * @private
 * @param manager Reference to the credential manager object that will fetch
 *        and apply credentials.
 * @param serviceAccounts An array of service accounts, mapped to the secrets
 *        that will be applied to the accounts.
 */
function _applyImagePullSecrets(
    manager: CredentialManager,
    serviceAccounts: Array<{
        serviceAccount: string;
        secrets: string[];
        namespace?: string;
    }>
): Promise<any[]> {
    return Promise.map(
        serviceAccounts,
        ({ serviceAccount, secrets, namespace }) => {
            _logger.trace('Applying image pull secret', {
                namespace,
                serviceAccount
            });

            return manager.applyImagePullSecrets(
                serviceAccount,
                secrets,
                namespace
            );
        }
    ).then(
        (data) => {
            _logger.trace('Image pull secrets applied');
            return data;
        },
        (err) => {
            const message = 'Error applying image pull secrets';
            _logger.error(err, message);
            throw new Error(message);
        }
    );
}

/**
 * Deletes components in the form of installed helm releases from the cluster.
 *
 * @private
 * @param components An array containing a list of releases to uninstall.
 */
function _uninstallComponents(components: string[]): () => Promise {
    _logger.trace('Uninstalling components from cluster');
    return Promise.map(components, (releaseName, index) => {
        _logger.trace('Uninstalling component', {
            index,
            releaseName
        });
        const helm = new Helm(releaseName);
        return helm.uninstall(true);
    }).then(
        () => {
            _logger.trace('Components uninstalled');
        },
        (err) => {
            const message = 'Error uninstalling components';
            _logger.error(err, message);
            throw new Error(message);
        }
    );
}

/**
 * Install components in the form of helm charts on the cluster.
 *
 * @private
 * @param installRecords An array containing the component definition, including
 *        the release name, chart name, namespace and install options.
 */
function _installComponents(
    installRecords: IChartInstallRecord[]
): () => Promise {
    _logger.trace('Installing components on the cluster');
    return Promise.map(installRecords, (installRecord, index) => {
        _logger.trace('Uninstalling component', {
            index,
            installRecord
        });

        const { releaseName, installOptions } = installRecord;
        const helm = new Helm(releaseName);
        return helm.install(installOptions);
    }).then(
        () => {
            _logger.trace('Components installed');
        },
        (err) => {
            const message = 'Error installing components';
            _logger.error(err, message);
            throw new Error(message);
        }
    );
}

export const command = 'apply';
export const describe =
    'Apply software updates to the cluster based on a manifest';
export const builder = {
    'callback-endpoint': {
        alias: 'c',
        describe: [
            'An http endpoint (including path) that can handle POST requests.',
            'The agent will use POST messages to notify the endpoint of the',
            'status of the operation and provide log data'
        ].join(' '),
        type: 'string',
        default: () => _configProvider.getConfig().get('callbackEndpoint')
    },
    'manifest-file': {
        alias: 'm',
        describe: [
            'Path to the manifest file that defines the components to install',
            'and/or delete'
        ].join(' '),
        type: 'string',
        default: () => _configProvider.getConfig().get('manifestFile')
    },
    'credential-provider-endpoint': {
        alias: 'p',
        describe: [
            'An http endpoint (including path) that can handle',
            'GET requests for credentials for both container',
            'and chart repositories'
        ].join(' '),
        type: 'string',
        default: () =>
            _configProvider.getConfig().get('credentialProviderEndpoint')
    },
    'credential-provider-auth': {
        alias: 'a',
        describe: [
            'The authorization token to use when communicating',
            'with the credential provider endpoint.'
        ].join(' '),
        type: 'string',
        default: () => _configProvider.getConfig().get('credentialProviderAuth')
    }
};

export const handler = (argv) => {
    _logger.trace('Running apply command', { argv });

    let reporter;
    let manifest;
    let credentialManager;

    return Promise.try(() => {
        _logger.trace('Initializing objects');
        reporter = new Reporter(argv.callbackEndpoint);
        manifest = new Manifest(argv.manifestFile);
        credentialManager = new CredentialManager(
            argv.credentialProviderEndpoint,
            argv.credentialProviderAuth
        );

        reporter.log('Objects initialized');
    })
        .then(() => {
            const path = argv.manifestFile;
            _logger.info('Loading manifest file', { path });
            reporter.log(`Initializing manifest from ${path}`);

            return _loadManifest(manifest);
        })
        .then(() => {
            const count = manifest.privateContainerRepos.length;
            _logger.info('Fetching container credentials', {
                count
            });
            reporter.log(
                `Fetching container credentials for ${count} repositories`
            );

            return _fetchContainerCredentials(
                credentialManager,
                manifest.privateContainerRepos.map((repo) => repo.repoUri)
            );
        })
        .then((credentials) => {
            _logger.trace('Building secret list');

            const secretMap = {};
            credentials.forEach((credential, index) => {
                const repo = manifest.privateContainerRepos[index];
                repo.targets.reduce((result, target) => {
                    const { namespace, secretName } = target;
                    const key = `${namespace}_${secretName}`;
                    if (!result[key]) {
                        result[key] = {
                            namespace,
                            secretName,
                            credential
                        };
                    }
                    return result;
                }, secretMap);
            });

            const secrets = Object.keys(secretMap).map((key) => secretMap[key]);
            _logger.trace('Secret list constructed', { secrets });

            const count = secrets.length;
            _logger.info('Creating kubernetes secrets', {
                count
            });
            reporter.log(`Creating kubernetes secrets for ${count} targets`);

            return _createImagePullSecrets(credentialManager, secrets);
        })
        .then(() => {
            _logger.trace('Building service account list');

            const serviceAccountMap = {};
            manifest.privateContainerRepos.forEach((repo) => {
                repo.targets.reduce((result, target) => {
                    const { namespace, secretName, serviceAccount } = target;
                    const key = `${namespace}_${serviceAccount}`;
                    if (!result[key]) {
                        result[key] = {
                            namespace,
                            serviceAccount,
                            secrets: []
                        };
                    }
                    result[key].secrets.push(secretName);

                    return result;
                }, serviceAccountMap);
            });

            const serviceAccounts = Object.keys(serviceAccountMap).map(
                (key) => serviceAccountMap[key]
            );
            _logger.trace('Service account list constructed', {
                serviceAccounts
            });

            const count = serviceAccounts.length;

            _logger.info('Applying kubernetes secrets', {
                count
            });
            reporter.log(
                `Applying kubernetes secrets to ${count} service accounts`
            );

            return _applyImagePullSecrets(credentialManager, serviceAccounts);
        })
        .then(() => {
            const count = manifest.uninstallRecords.length;
            _logger.info('Uninstalling components', {
                count
            });
            reporter.log(`Uninstalling ${count} components`);

            return _uninstallComponents(manifest.uninstallRecords);
        })
        .then(() => {
            const count = manifest.installRecords.length;
            _logger.info('Installing and/or upgrading components', {
                count
            });
            reporter.log(`Installing ${count} components`);

            return _installComponents(manifest.installRecords);
        })
        .then(() => {
            _logger.info('Update complete. Reporting success');
            reporter.success('Update complete');
        })
        .catch(ArgError, (err) => {
            _logger.fatal(err);
            throw new Error('Argument error. Please check input arguments');
        })
        .catch((err) => {
            _logger.fatal(err);
            if (reporter) {
                _logger.info('Reporting failure to callback endpoint');
                reporter.fail(err.message);
            }
            throw err;
        })
        .finally(() => {
            if (reporter) {
                _logger.info('Flushing reporter');
                return reporter.flush().catch((ex) => {
                    _logger.fatal('Fatal error flushing reporter');
                });
            } else {
                _logger.fatal('Reporter not initialized. Cannot flush');
            }
        });
};
