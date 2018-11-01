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
import { IChartInstallRecord } from '../types';

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
 * Fetches credentials for repos and applies them.
 *
 * @private
 * @param manager Reference to the credential manager object that will fetch
 *        and apply credentials.
 * @param repos An array of repositories for which credentials need to be
 *        obtained.
 */
function _applyCredentials(
    manager: CredentialManager,
    repos: string[]
): () => Promise {
    _logger.trace('Applying repository credentials');
    return Promise.map(repos, (repo, index) => {
        _logger.trace('Applying credentials for container repository', {
            index,
            repository: repo
        });
        return manager.applyCredentials('container', repo);
    }).then(
        () => {
            _logger.trace('Repository credentials applied');
        },
        (err) => {
            const message = 'Error applying resource credentials';
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
            const count = manifest.containerRepositories.length;
            _logger.info('Applying resource credentials to service account', {
                count
            });
            reporter.log(`Applying credentials for ${count} repositories`);

            return _applyCredentials(
                credentialManager,
                manifest.containerRepositories
            );
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
