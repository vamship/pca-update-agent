import { default as _chai, expect } from 'chai';
import _chaiAsPromised from 'chai-as-promised';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);
_chai.use(_chaiAsPromised);
import 'mocha';

import _rewire from 'rewire';
import _sinon from 'sinon';

import { args as _args } from '@vamship/error-types';
import {
    asyncHelper as _asyncHelper,
    ObjectMock,
    testValues as _testValues
} from '@vamship/test-utils';

import {
    IChartInstallRecord,
    IContainerCredentials,
    IPrivateContainerRepoRecord
} from '../../../src/types';
const _commandModule = _rewire('../../../src/commands/apply');
const { ArgError } = _args;

describe('[apply command]', () => {
    function _execHandler(args: object = {}) {
        const callbackEndpoint = _testValues.getString('callbackEndpoint');
        const manifestFile = _testValues.getString('manifestFile');

        args = Object.assign({ callbackEndpoint, manifestFile }, args);

        return _commandModule.handler(args);
    }

    let _configMock;
    let _reporterMock;
    let _manifestMock;
    let _credentialManagerMock;
    let _helmMock;

    beforeEach(() => {
        _configMock = new ObjectMock().addMock('get', (key) => {
            return _configMock.__data[key];
        });
        _configMock.__data = {
            callbackEndpoint: _testValues.getString('callbackEndpoint'),
            manifestFile: _testValues.getString('manifestFile'),
            credentialProviderEndpoint: _testValues.getString(
                'credentialProviderEndpoint'
            ),
            credentialProviderAuth: _testValues.getString(
                'credentialProviderAuth'
            )
        };

        _reporterMock = new ObjectMock()
            .addMock('log')
            .addMock('success')
            .addMock('fail')
            .addPromiseMock('flush');

        _manifestMock = new ObjectMock().addPromiseMock('load');
        _manifestMock.instance.installRecords = [];
        _manifestMock.instance.uninstallRecords = [];
        _manifestMock.instance.privateContainerRepos = [];

        _credentialManagerMock = new ObjectMock()
            .addPromiseMock('fetchContainerCredentials')
            .addPromiseMock('createImagePullSecret')
            .addPromiseMock('applyImagePullSecrets');

        _helmMock = new ObjectMock()
            .addPromiseMock('install')
            .addPromiseMock('uninstall');

        _commandModule.__set__('config_1', {
            default: {
                getConfig: () => _configMock.instance
            }
        });
        _commandModule.__set__('reporter_1', {
            default: _reporterMock.ctor
        });
        _commandModule.__set__('manifest_1', {
            default: _manifestMock.ctor
        });
        _commandModule.__set__('credential_manager_1', {
            default: _credentialManagerMock.ctor
        });
        _commandModule.__set__('helm_1', {
            default: _helmMock.ctor
        });
    });

    describe('[init]', () => {
        it('should export properties required by the command', () => {
            const expectedCommand = 'apply';
            const expectedDescription =
                'Apply software updates to the cluster based on a manifest';
            const expectedBuilder = {
                'callback-endpoint': {
                    alias: 'c',
                    describe: [
                        'An http endpoint (including path) that can',
                        'handle POST requests. The agent will use POST messages',
                        'to notify the endpoint of the status of the operation',
                        'and provide log data'
                    ].join(' '),
                    type: 'string',
                    default: _configMock.__data.callbackEndpoint
                },
                'manifest-file': {
                    alias: 'm',
                    describe: [
                        'Path to the manifest file that defines the',
                        'components to install and/or delete'
                    ].join(' '),
                    type: 'string',
                    default: _configMock.__data.manifestFile
                },
                'credential-provider-endpoint': {
                    alias: 'p',
                    describe: [
                        'An http endpoint (including path) that can handle',
                        'GET requests for credentials for both container',
                        'and chart repositories'
                    ].join(' '),
                    type: 'string',
                    default: _configMock.__data.credentialProviderEndpoint
                },
                'credential-provider-auth': {
                    alias: 'a',
                    describe: [
                        'The authorization token to use when communicating',
                        'with the credential provider endpoint.'
                    ].join(' '),
                    type: 'string',
                    default: _configMock.__data.credentialProviderAuth
                }
            };

            expect(_commandModule.command).to.equal(expectedCommand);
            expect(_commandModule.describe).to.equal(expectedDescription);
            Object.keys(_commandModule.builder).forEach((key) => {
                const option = _commandModule.builder[key];
                const expectedOption = expectedBuilder[key];

                expect(option.alias).to.equal(expectedOption.alias);
                expect(option.describe).to.equal(expectedOption.describe);
                expect(option.type).to.equal(expectedOption.type);
                expect(option.default).to.be.a('function');
                expect(option.default()).to.equal(expectedOption.default);
            });
            expect(_commandModule.handler).to.be.a('function');
        });
    });

    describe('[execution]', () => {
        function _getPrivateContainerRepos(
            size: number
        ): IPrivateContainerRepoRecord[] {
            const serviceAccountCount = 2;
            const namespaceCount = 2;

            const serviceAccounts = new Array(serviceAccountCount)
                .fill(0)
                .map((item, index) => `serviceAccount_${index}`);
            const namespaces = new Array(namespaceCount)
                .fill(0)
                .map((item, index) => `namespace_${index}`);

            return new Array(size).fill(0).map((item, index) => {
                const repoUri = `containerRepository_${index}`;
                const targets = serviceAccounts
                    .map((serviceAccount) => {
                        return namespaces.map((namespace) => {
                            return {
                                secretName: `secretName_${repoUri}`,
                                serviceAccount,
                                namespace
                            };
                        });
                    })
                    .reduce((result, targetArr) => {
                        return result.concat(targetArr);
                    }, []);

                return {
                    repoUri,
                    targets
                };
            });
        }

        function _getUninstallRecords(size: number): string[] {
            return new Array(size)
                .fill(0)
                .map((item, index) =>
                    _testValues.getString(`uninstallComponent{index}`)
                );
        }

        function _getInstallRecords(size: number): IChartInstallRecord[] {
            return new Array(size).fill(0).map((item, index) => ({
                releaseName: _testValues.getString(`releaseName${index}`),
                installOptions: {
                    chartName: _testValues.getString(`chartName${index}`),
                    namespace: _testValues.getString(`namespace${index}`),
                    setOptions: new Array(3)
                        .fill(0)
                        .map((option, optionIndex) =>
                            _testValues.getString(`setOption${optionIndex}`)
                        )
                }
            }));
        }

        function _bulkComplete(
            mock: any,
            recordCount: number,
            failIndex: number = -1,
            resolver: () => any = () => undefined
        ): Promise<any> {
            const promises: any[] = [];

            for (let index = 0; index < recordCount; index++) {
                let promise;
                if (index !== failIndex) {
                    promise = mock.resolve(resolver(), index);
                } else {
                    promise = mock
                        .reject('something went wrong!', index)
                        .catch((ex) => {
                            // Eat this exception to avoid warnings.
                            // We are checking for rejection later.
                        });
                }
                promises.push(promise);
            }
            return Promise.all(promises);
        }

        function _generateCredentials(): IContainerCredentials {
            return {
                server: _testValues.getString('server'),
                username: _testValues.getString('username'),
                password: _testValues.getString('password'),
                email: _testValues.getString('email')
            };
        }

        function _buildSecretList(
            credentials: IContainerCredentials[],
            repos: IPrivateContainerRepoRecord[]
        ): Array<{
            secretName: string;
            credentials: IContainerCredentials;
            namespace?: string;
        }> {
            const secretMap = {};
            credentials.forEach((credential, index) => {
                repos[index].targets.reduce((result, target) => {
                    const { namespace, secretName } = target;
                    const key = `${namespace}_${secretName}`;
                    if (!result[key]) {
                        result[key] = {
                            secretName,
                            namespace,
                            credentials: credential
                        };
                    }
                    return result;
                }, secretMap);
            });
            return Object.keys(secretMap).map((key) => secretMap[key]);
        }

        function _buildServiceAccountList(
            repos: IPrivateContainerRepoRecord[]
        ): Array<{
            serviceAccount: string;
            namespace?: string;
            secrets: string[];
        }> {
            const serviceAccountMap = {};

            repos.forEach((repo) => {
                repo.targets.forEach(
                    ({ namespace, serviceAccount, secretName }) => {
                        const key = `${namespace}_${serviceAccount}`;
                        let bucket = serviceAccountMap[key];
                        if (!bucket) {
                            bucket = {
                                serviceAccount,
                                namespace,
                                secrets: []
                            };
                            serviceAccountMap[key] = bucket;
                        }
                        bucket.secrets.push(secretName);
                    }
                );
            });
            return Object.keys(serviceAccountMap).map(
                (key) => serviceAccountMap[key]
            );
        }

        it('should return a promise when invoked', () => {
            const ret = _execHandler();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should initialize the reporter object with correct parameters', () => {
            const callbackEndpoint = _testValues.getString('callbackEndpoint');
            expect(_reporterMock.ctor).to.not.have.been.called;
            _execHandler({
                callbackEndpoint
            });

            expect(_reporterMock.ctor).to.have.been.calledOnce;
            expect(_reporterMock.ctor).to.have.been.calledWithNew;
            expect(_reporterMock.ctor).to.have.been.calledWithExactly(
                callbackEndpoint
            );
        });

        it('should reject the promise if reporter initialization fails', () => {
            const expectedError =
                'Argument error. Please check input arguments';
            _reporterMock.ctor.throws(new ArgError('something went wrong!'));

            const ret = _execHandler();

            return expect(ret).to.have.been.rejectedWith(expectedError);
        });

        it('should initialize the manifest object with the correct parameters', () => {
            const manifestFile = _testValues.getString('manifestFile');
            expect(_manifestMock.ctor).to.not.have.been.called;
            _execHandler({
                manifestFile
            });

            expect(_manifestMock.ctor).to.have.been.calledOnce;
            expect(_manifestMock.ctor).to.have.been.calledWithNew;
            expect(_manifestMock.ctor).to.have.been.calledWithExactly(
                manifestFile
            );
        });

        it('should initialize the credential manager object with the correct parameters', () => {
            const credentialProviderEndpoint = _testValues.getString(
                'credentialProviderEndpoint'
            );
            const credentialProviderAuth = _testValues.getString(
                'credentialProviderAuth'
            );

            expect(_credentialManagerMock.ctor).to.not.have.been.called;

            _execHandler({
                credentialProviderEndpoint,
                credentialProviderAuth
            });

            expect(_credentialManagerMock.ctor).to.have.been.calledOnce;
            expect(_credentialManagerMock.ctor).to.have.been.calledWithNew;
            expect(_credentialManagerMock.ctor).to.have.been.calledWithExactly(
                credentialProviderEndpoint,
                credentialProviderAuth
            );
        });

        it('should load the manifest file from the file system', () => {
            const loadMethod = _manifestMock.mocks.load;

            expect(loadMethod.stub).to.not.have.been.called;

            _execHandler();

            return _asyncHelper
                .wait(10)()
                .then(() => {
                    expect(loadMethod.stub).to.have.been.calledOnce;
                    expect(loadMethod.stub.args[0]).to.have.length(0);
                });
        });

        it('should report failure and reject the promise if the manifest load fails', () => {
            const loadMethod = _manifestMock.mocks.load;
            const failMethod = _reporterMock.mocks.fail;
            const flushMethod = _reporterMock.mocks.flush;
            const loadError = new Error('something went wrong!');
            const expectedError = 'Error loading manifest file';

            expect(failMethod.stub).to.not.have.been.called;
            expect(flushMethod.stub).to.not.have.been.called;

            const ret = _execHandler();

            return loadMethod
                .reject(loadError)
                .catch((err) => {
                    return _reporterMock.mocks.flush.resolve();
                })
                .then(() => {
                    return expect(ret)
                        .to.be.rejectedWith(expectedError)
                        .then(() => {
                            expect(failMethod.stub).to.have.been.calledOnce;
                            expect(flushMethod.stub).to.have.been.calledOnce;
                        });
                });
        });

        it('should fetch credentials for every repository identified in the manifest', () => {
            const fetchCredentialsMethod =
                _credentialManagerMock.mocks.fetchContainerCredentials;

            const repoCount = _testValues.getNumber(10, 5);
            const expectedRepos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = expectedRepos;

            expect(fetchCredentialsMethod.stub).to.not.have.been.called;

            _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(_asyncHelper.wait(10))
                .then(() => {
                    expect(fetchCredentialsMethod.stub).to.have.been.called;
                    expect(fetchCredentialsMethod.stub.callCount).to.equal(
                        expectedRepos.length
                    );

                    expectedRepos.forEach((repo, index) => {
                        expect(
                            fetchCredentialsMethod.stub.args[index][0]
                        ).to.equal(repo.repoUri);
                    });
                });
        });

        it('should report failure and reject the promise if any one of the credential fetches fails', () => {
            const failMethod = _reporterMock.mocks.fail;
            const flushMethod = _reporterMock.mocks.flush;

            const failIndex = _testValues.getNumber(10, 5);
            const expectedRepos = _getPrivateContainerRepos(failIndex * 2);
            _manifestMock.instance.privateContainerRepos = expectedRepos;
            const expectedError = 'Error fetching container credentials';

            expect(failMethod.stub).to.not.have.been.called;
            expect(flushMethod.stub).to.not.have.been.called;

            const ret = _execHandler();
            ret.catch((ex) => {
                // Eat this exception to avoid warnings.
                // We are checking for rejection later.
            });

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        failIndex * 2,
                        failIndex
                    );
                })
                .then(() => {
                    return _reporterMock.mocks.flush.resolve();
                })
                .then(() => {
                    return expect(ret)
                        .to.be.rejectedWith(expectedError)
                        .then(() => {
                            expect(failMethod.stub).to.have.been.calledOnce;
                            expect(flushMethod.stub).to.have.been.calledOnce;
                        });
                });
        });

        it('should create secrets for every target specified', () => {
            const createImagePullSecretMethod =
                _credentialManagerMock.mocks.createImagePullSecret;

            const repoCount = _testValues.getNumber(10, 5);
            const expectedRepos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = expectedRepos;

            expect(createImagePullSecretMethod.stub).to.not.have.been.called;

            _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount,
                        -1,
                        _generateCredentials
                    );
                })
                .then((credentials) => {
                    const expectedSecrets = _buildSecretList(
                        credentials,
                        expectedRepos
                    );

                    expect(createImagePullSecretMethod.stub).to.have.been
                        .called;
                    expect(createImagePullSecretMethod.stub.callCount).to.equal(
                        expectedSecrets.length
                    );

                    expectedSecrets.forEach((secret, index) => {
                        const args =
                            createImagePullSecretMethod.stub.args[index];
                        expect(args[0]).to.equal(secret.secretName);
                        expect(args[1]).to.deep.equal(secret.credentials);
                        expect(args[2]).to.deep.equal(secret.namespace);
                    });
                });
        });

        it('should report failure and reject the promise if any one of the secret creations fails', () => {
            const failMethod = _reporterMock.mocks.fail;
            const flushMethod = _reporterMock.mocks.flush;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const expectedError = 'Error creating image pull secrets';

            expect(failMethod.stub).to.not.have.been.called;
            expect(flushMethod.stub).to.not.have.been.called;

            const ret = _execHandler();
            ret.catch((ex) => {
                // Eat this exception to avoid warnings.
                // We are checking for rejection later.
            });

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount,
                        -1,
                        _generateCredentials
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    const failIndex = _testValues.getNumber(secretList.length);
                    _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length,
                        failIndex
                    );
                })
                .then(() => {
                    return _reporterMock.mocks.flush.resolve();
                })
                .then(() => {
                    return expect(ret)
                        .to.be.rejectedWith(expectedError)
                        .then(() => {
                            expect(failMethod.stub).to.have.been.calledOnce;
                            expect(flushMethod.stub).to.have.been.calledOnce;
                        });
                });
        });

        it('should patch the service account with the correct image pull secrets', () => {
            const applyImagePullSecretsMethod =
                _credentialManagerMock.mocks.applyImagePullSecrets;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            expect(applyImagePullSecretsMethod.stub).to.not.have.been.called;

            _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount,
                        -1,
                        _generateCredentials
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    expect(applyImagePullSecretsMethod.stub).to.have.been
                        .called;
                    expect(applyImagePullSecretsMethod.stub.callCount).to.equal(
                        serviceAccountList.length
                    );

                    serviceAccountList.forEach((serviceAccount, index) => {
                        const args =
                            applyImagePullSecretsMethod.stub.args[index];
                        expect(args[0]).to.equal(serviceAccount.serviceAccount);
                        expect(args[1]).to.deep.equal(serviceAccount.secrets);
                        expect(args[2]).to.deep.equal(serviceAccount.namespace);
                    });
                });
        });

        it('should report failure and reject the promise if any one of the apply operations fails', () => {
            const failMethod = _reporterMock.mocks.fail;
            const flushMethod = _reporterMock.mocks.flush;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const expectedError = 'Error applying image pull secrets';

            expect(failMethod.stub).to.not.have.been.called;
            expect(flushMethod.stub).to.not.have.been.called;

            const ret = _execHandler();
            ret.catch((ex) => {
                // Eat this exception to avoid warnings.
                // We are checking for rejection later.
            });

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount,
                        -1,
                        _generateCredentials
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    const failIndex = _testValues.getNumber(
                        serviceAccountList.length
                    );
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length,
                        failIndex
                    );
                })
                .then(() => {
                    return _reporterMock.mocks.flush.resolve();
                })
                .then(() => {
                    return expect(ret)
                        .to.be.rejectedWith(expectedError)
                        .then(() => {
                            expect(failMethod.stub).to.have.been.calledOnce;
                            expect(flushMethod.stub).to.have.been.calledOnce;
                        });
                });
        });

        it('should create a new Helm object for each record in the uninstall list of the manifest', () => {
            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const uninstallCount = _testValues.getNumber(10, 5);
            const uninstallRecords = _getUninstallRecords(uninstallCount);
            _manifestMock.instance.uninstallRecords = uninstallRecords;

            expect(_helmMock.ctor).to.not.have.been.called;

            _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                })
                .then(() => {
                    expect(_helmMock.ctor).to.have.been.called;
                    expect(_helmMock.ctor.callCount).to.equal(uninstallCount);
                    uninstallRecords.forEach((record, index) => {
                        expect(_helmMock.ctor.args[index]).to.have.length(1);
                        expect(_helmMock.ctor.args[index][0]).to.equal(record);
                    });
                });
        });

        it('should uninstall each record in the uninstall list', () => {
            const uninstallMethod = _helmMock.mocks.uninstall;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const uninstallCount = _testValues.getNumber(10, 5);
            const uninstallRecords = _getUninstallRecords(uninstallCount);
            _manifestMock.instance.uninstallRecords = uninstallRecords;

            expect(uninstallMethod.stub).to.not.have.been.called;

            _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                })
                .then(() => {
                    expect(uninstallMethod.stub).to.have.been.called;
                    expect(uninstallMethod.stub.callCount).to.equal(
                        uninstallCount
                    );
                    uninstallRecords.forEach((record, index) => {
                        expect(uninstallMethod.stub.args[index]).to.have.length(
                            1
                        );
                        expect(uninstallMethod.stub.args[index][0]).to.be.true;
                    });
                });
        });

        it('should report failure and reject the promise if any one of the uninstalls fails', () => {
            const failMethod = _reporterMock.mocks.fail;
            const flushMethod = _reporterMock.mocks.flush;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const failIndex = _testValues.getNumber(10, 5);
            const uninstallRecords = _getUninstallRecords(failIndex * 2);
            _manifestMock.instance.uninstallRecords = uninstallRecords;

            const expectedError = 'Error uninstalling component';

            expect(failMethod.stub).to.not.have.been.called;
            expect(flushMethod.stub).to.not.have.been.called;

            const ret = _execHandler();
            ret.catch((ex) => {
                // Eat this exception to avoid warnings.
                // We are checking for rejection later.
            });

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                })
                .then(() => {
                    return _bulkComplete(
                        _helmMock.mocks.uninstall,
                        failIndex * 2,
                        failIndex
                    );
                })
                .then(() => {
                    return _reporterMock.mocks.flush.resolve();
                })
                .then(() => {
                    return expect(ret)
                        .to.be.rejectedWith(expectedError)
                        .then(() => {
                            expect(failMethod.stub).to.have.been.calledOnce;
                            expect(flushMethod.stub).to.have.been.calledOnce;
                        });
                });
        });

        it('should create a new Helm object for each record in the install list of the manifest', () => {
            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const uninstallCount = _testValues.getNumber(10, 5);
            _manifestMock.instance.uninstallRecords = _getUninstallRecords(
                uninstallCount
            );
            const installCount = _testValues.getNumber(10, 5);
            const installRecords = _getInstallRecords(installCount);
            _manifestMock.instance.installRecords = installRecords;

            expect(_helmMock.ctor.resetHistory()).to.not.have.been.called;

            _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                })
                .then(() => {
                    return _bulkComplete(
                        _helmMock.mocks.uninstall,
                        uninstallCount
                    );
                })
                .then(() => {
                    const expectedCount = installCount + uninstallCount;
                    expect(_helmMock.ctor).to.have.been.called;
                    expect(_helmMock.ctor.callCount).to.equal(expectedCount);
                    installRecords.forEach((installRecord, index) => {
                        const { releaseName } = installRecord;
                        const ctorArgs =
                            _helmMock.ctor.args[uninstallCount + index];
                        expect(ctorArgs).to.have.length(1);
                        expect(ctorArgs[0]).to.equal(releaseName);
                    });
                });
        });

        it('should install each component in the install list', () => {
            const installMethod = _helmMock.mocks.install;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const uninstallCount = _testValues.getNumber(10, 5);
            _manifestMock.instance.uninstallRecords = _getUninstallRecords(
                uninstallCount
            );
            const installCount = _testValues.getNumber(10, 5);
            const installRecords = _getInstallRecords(installCount);
            _manifestMock.instance.installRecords = installRecords;

            expect(_helmMock.ctor.resetHistory()).to.not.have.been.called;

            _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                })
                .then(() => {
                    return _bulkComplete(
                        _helmMock.mocks.uninstall,
                        uninstallCount
                    );
                })
                .then(() => {
                    expect(installMethod.stub).to.have.been.called;
                    expect(installMethod.stub.callCount).to.equal(installCount);
                    installRecords.forEach((installRecord, index) => {
                        const { installOptions } = installRecord;
                        const installArgs = installMethod.stub.args[index];
                        expect(installArgs).to.have.length(1);
                        expect(installArgs[0]).to.deep.equal(installOptions);
                    });
                });
        });

        it('should report failure and reject the promise if any one of the installs fails', () => {
            const failMethod = _reporterMock.mocks.fail;
            const flushMethod = _reporterMock.mocks.flush;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const uninstallCount = _testValues.getNumber(10, 5);
            _manifestMock.instance.uninstallRecords = _getUninstallRecords(
                uninstallCount
            );

            const failIndex = _testValues.getNumber(10, 5);
            const installRecords = _getInstallRecords(failIndex * 2);
            _manifestMock.instance.installRecords = installRecords;

            const expectedError = 'Error installing component';

            expect(failMethod.stub).to.not.have.been.called;
            expect(flushMethod.stub).to.not.have.been.called;

            const ret = _execHandler();
            ret.catch((ex) => {
                // Eat this exception to avoid warnings.
                // We are checking for rejection later.
            });

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                })
                .then(() => {
                    return _bulkComplete(
                        _helmMock.mocks.uninstall,
                        uninstallCount
                    );
                })
                .then(() => {
                    return _bulkComplete(
                        _helmMock.mocks.install,
                        failIndex * 2,
                        failIndex
                    );
                })
                .then(() => {
                    return _reporterMock.mocks.flush.resolve();
                })
                .then(() => {
                    return expect(ret)
                        .to.be.rejectedWith(expectedError)
                        .then(() => {
                            expect(failMethod.stub).to.have.been.calledOnce;
                            expect(flushMethod.stub).to.have.been.calledOnce;
                        });
                });
        });

        it('should handle flush errors gracefully', () => {
            const flushMethod = _reporterMock.mocks.flush;

            expect(flushMethod.stub).to.not.have.been.called;
            const ret = _execHandler();

            return _manifestMock.mocks.load
                .reject(new Error('something went wrong'))
                .then(undefined, (err) => {
                    // Eat this exception to avoid warnings.
                    // We are checking for rejection later.
                })
                .then(() => {
                    return _reporterMock.mocks.flush
                        .reject(new Error('flush failed'))
                        .catch((ex) => {
                            // Eat this exception to avoid warnings.
                            // We are checking for rejection later.
                        });
                })
                .then(() => {
                    return expect(ret).to.be.rejected;
                });
        });

        it('should report success and resolve the promise if all tasks succeed', () => {
            const successMethod = _reporterMock.mocks.success;
            const flushMethod = _reporterMock.mocks.flush;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const uninstallCount = _testValues.getNumber(10, 5);
            _manifestMock.instance.uninstallRecords = _getUninstallRecords(
                uninstallCount
            );

            const installCount = _testValues.getNumber(10, 5);
            _manifestMock.instance.installRecords = _getInstallRecords(
                installCount
            );

            expect(successMethod.stub).to.not.have.been.called;
            expect(flushMethod.stub).to.not.have.been.called;

            const ret = _execHandler();

            return _manifestMock.mocks.load
                .resolve()
                .then(() => {
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount
                    );
                })
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                })
                .then(() => {
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                })
                .then(() => {
                    return _bulkComplete(
                        _helmMock.mocks.uninstall,
                        uninstallCount
                    );
                })
                .then(() => {
                    return _bulkComplete(_helmMock.mocks.install, installCount);
                })
                .then(() => {
                    return _reporterMock.mocks.flush.resolve();
                })
                .then(() => {
                    return expect(ret).to.be.fulfilled.then(() => {
                        expect(successMethod.stub).to.have.been.calledOnce;
                        expect(flushMethod.stub).to.have.been.calledOnce;
                    });
                });
        });
    });
});
