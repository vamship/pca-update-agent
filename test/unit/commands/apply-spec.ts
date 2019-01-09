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
import { Promise } from 'bluebird';

import {
    IContainerCredentials,
    IInstallRecord,
    IPrivateContainerRepoRecord
} from '../../../src/types';
const _commandModule = _rewire('../../../src/commands/apply');
const { ArgError } = _args;

describe('[apply command]', () => {
    function _execHandler(args: object = {}) {
        const callbackEndpoint = _testValues.getString('callbackEndpoint');
        const manifestFile = _testValues.getString('manifestFile');
        const dryRunInstall = false;
        const dryRunUninstall = false;
        const repoList = new Array(10)
            .fill(0)
            .map(
                () =>
                    `${_testValues.getString(
                        'repoName'
                    )},https://${_testValues.getString('repoUrl')}`
            )
            .join('|');

        args = Object.assign(
            {
                callbackEndpoint,
                manifestFile,
                dryRunInstall,
                dryRunUninstall,
                repoList
            },
            args
        );

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
            ),
            dryRunInstall: _testValues.getNumber(1, 10) < 5,
            dryRunUninstall: _testValues.getNumber(1, 10) < 5,
            repoList: new Array(10)
                .fill(0)
                .map(
                    () =>
                        `${_testValues.getString(
                            'repoName'
                        )},https://${_testValues.getString('repoUrl')}`
                )
                .join('|')
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

        _helmMock.__static = new ObjectMock()
            .addPromiseMock('addRepository')
            .addPromiseMock('updateRepositories');

        ['addRepository', 'updateRepositories'].forEach((method) => {
            _helmMock.ctor[method] = _helmMock.__static.instance[method];
        });

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
                },
                'dry-run-install': {
                    alias: 'i',
                    describe: [
                        'Execute helm install in dry-run mode, which means',
                        'that the install command will not have any effect'
                    ].join(' '),
                    type: 'boolean',
                    default: _configMock.__data.dryRunInstall
                },
                'dry-run-uninstall': {
                    alias: 'i',
                    describe: [
                        'Execute helm uninstall in dry-run mode, which means',
                        'that the uninstall command will not have any effect'
                    ].join(' '),
                    type: 'boolean',
                    default: _configMock.__data.dryRunInstall
                },
                'repo-list': {
                    alias: 'r',
                    describe: [
                        'A string that defines a list of helm stores that will',
                        'be accessed by the update agent. The string must be',
                        'in the format:',
                        '<repoName>,<repoUrl>|<repoName>,<repoUrl>'
                    ].join(' '),
                    type: 'string',
                    default: _configMock.__data.repoList
                }
            };

            expect(_commandModule.command).to.equal(expectedCommand);
            expect(_commandModule.describe).to.equal(expectedDescription);
            Object.keys(expectedBuilder).forEach((key) => {
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

        function _getInstallRecords(size: number): IInstallRecord[] {
            return new Array(size).fill(0).map((item, index) => ({
                releaseName: _testValues.getString(`releaseName${index}`),
                chartName: _testValues.getString(`chartName${index}`),
                namespace: _testValues.getString(`namespace${index}`),
                setOptions: new Array(3)
                    .fill(0)
                    .map((option, optionIndex) =>
                        _testValues.getString(`setOption${optionIndex}`)
                    )
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
            namespace: string;
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

        enum Tasks {
            INITIALIZE_OBJECTS = 0,
            ADD_REPOS,
            UPDATE_REPOS,
            LOAD_MANIFEST,
            FETCH_CREDENTIALS,
            CREATE_IMAGE_PULL_SECRETS,
            APPLY_IMAGE_PULL_SECRETS,
            UNINSTALL_COMPONENTS,
            INSTALL_COMPONENTS,
            END
        }

        function _runUntilTask(depth: Tasks): Promise<any> {
            const addRepositoryMethod = _helmMock.__static.mocks.addRepository;
            const updateRepositoriesMethod =
                _helmMock.__static.mocks.updateRepositories;
            const loadMethod = _manifestMock.mocks.load;

            const actions = [
                () => undefined,
                () => {
                    const count = addRepositoryMethod.stub.callCount;
                    return Promise.map(new Array(count).fill(0), (arg, index) =>
                        addRepositoryMethod.resolve(undefined, index)
                    );
                },
                () => updateRepositoriesMethod.resolve(),
                () => loadMethod.resolve(),
                () => {
                    const repoCount =
                        _manifestMock.instance.privateContainerRepos.length;
                    return _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        repoCount,
                        -1,
                        _generateCredentials
                    );
                },
                (credentials) => {
                    const repos = _manifestMock.instance.privateContainerRepos;
                    const secretList = _buildSecretList(credentials, repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length
                    );
                },
                () => {
                    const repos = _manifestMock.instance.privateContainerRepos;
                    const serviceAccountList = _buildServiceAccountList(repos);
                    return _bulkComplete(
                        _credentialManagerMock.mocks.applyImagePullSecrets,
                        serviceAccountList.length
                    );
                },
                () => {
                    const uninstallCount =
                        _manifestMock.instance.uninstallRecords.length;
                    return _bulkComplete(
                        _helmMock.mocks.uninstall,
                        uninstallCount
                    );
                },
                () => {
                    const installCount =
                        _manifestMock.instance.installRecords.length;
                    return _bulkComplete(_helmMock.mocks.install, installCount);
                }
            ];

            return actions
                .reduce((result, action, index) => {
                    if (index < depth) {
                        return result.then(action);
                    } else {
                        return result;
                    }
                }, Promise.resolve())
                .then((result) => {
                    return _asyncHelper
                        .wait(1)()
                        .then(() => result);
                });
        }

        function _verifyCleanup(): () => void {
            return () => {
                const failMethod = _reporterMock.mocks.fail;
                const flushMethod = _reporterMock.mocks.flush;

                expect(failMethod.stub).to.have.been.calledOnce;
                expect(flushMethod.stub).to.have.been.calledOnce;
            };
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

        it('should add each repo index to the local helm installation', () => {
            const addRepositoryMethod = _helmMock.__static.mocks.addRepository;
            const repoCount = _testValues.getNumber(1, 10);
            const repoList = new Array(repoCount).fill(0).map(() => ({
                repoName: _testValues.getString('repoName'),
                repoUrl: _testValues.getString('repoUrl')
            }));

            expect(addRepositoryMethod.stub).to.not.have.been.called;
            _execHandler({
                repoList: repoList
                    .map(({ repoName, repoUrl }) => `${repoName},${repoUrl}`)
                    .join('|')
            });

            return _runUntilTask(Tasks.INITIALIZE_OBJECTS).then(() => {
                expect(addRepositoryMethod.stub).to.have.been.called;
                expect(addRepositoryMethod.stub.callCount).to.equal(repoCount);
                repoList.forEach((repoData, index) => {
                    const call = addRepositoryMethod.stub.getCall(index);
                    const { repoName, repoUrl } = repoData;

                    expect(call).to.have.been.calledWithExactly(
                        repoName,
                        repoUrl
                    );
                });
            });
        });

        it('should report failure and reject the promise any of the repo add methods fail', () => {
            const addRepositoryMethod = _helmMock.__static.mocks.addRepository;
            const addRepoError = new Error('something went wrong!');
            const expectedError = 'Error adding helm repo';

            const repoCount = _testValues.getNumber(1, 10);
            const repoList = new Array(repoCount).fill(0).map(() => ({
                repoName: _testValues.getString('repoName'),
                repoUrl: _testValues.getString('repoUrl')
            }));

            const ret = _execHandler({
                repoList: repoList
                    .map(({ repoName, repoUrl }) => `${repoName},${repoUrl}`)
                    .join('|')
            });

            _runUntilTask(Tasks.INITIALIZE_OBJECTS)
                .then(() => {
                    const failIndex = Math.floor(Math.random() * repoCount);
                    return addRepositoryMethod.reject(addRepoError, failIndex);
                })
                .catch((err) => undefined) // Eat this error, checking for rejection later
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
        });

        it('should update helm repos if repos were added successfully', () => {
            const updateRepositoriesMethod =
                _helmMock.__static.mocks.updateRepositories;

            expect(updateRepositoriesMethod.stub).to.not.have.been.called;

            _execHandler();

            return _runUntilTask(Tasks.UPDATE_REPOS).then(() => {
                expect(updateRepositoriesMethod.stub).to.have.been.calledOnce;
            });
        });

        it('should report failure and reject the promise if the update method fails', () => {
            const updateRepositoriesMethod =
                _helmMock.__static.mocks.updateRepositories;
            const updateRepoError = new Error('something went wrong!');
            const expectedError = 'Error updating helm repositories';

            const ret = _execHandler();

            _runUntilTask(Tasks.UPDATE_REPOS)
                .then(() => updateRepositoriesMethod.reject(updateRepoError))
                .catch((err) => undefined) // Eat this error, checking for rejection later
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
        });

        it('should load the manifest file from the file system', () => {
            const loadMethod = _manifestMock.mocks.load;

            expect(loadMethod.stub).to.not.have.been.called;

            _execHandler();

            return _runUntilTask(Tasks.LOAD_MANIFEST).then(() => {
                expect(loadMethod.stub).to.have.been.calledOnce;
                expect(loadMethod.stub).to.have.been.calledWithExactly();
            });
        });

        it('should report failure and reject the promise if the manifest load fails', () => {
            const loadMethod = _manifestMock.mocks.load;
            const loadError = new Error('something went wrong!');
            const expectedError = 'Error loading manifest file';

            const ret = _execHandler();

            _runUntilTask(Tasks.LOAD_MANIFEST)
                .then(() => loadMethod.reject(loadError))
                .catch((err) => undefined) // Eat this error, checking for rejection later
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
        });

        it('should fetch credentials for every repository identified in the manifest', () => {
            const fetchCredentialsMethod =
                _credentialManagerMock.mocks.fetchContainerCredentials;

            const repoCount = _testValues.getNumber(10, 5);
            const expectedRepos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = expectedRepos;

            expect(fetchCredentialsMethod.stub).to.not.have.been.called;

            _execHandler();

            return _runUntilTask(Tasks.FETCH_CREDENTIALS).then(() => {
                expect(fetchCredentialsMethod.stub).to.have.been.called;
                expect(fetchCredentialsMethod.stub.callCount).to.equal(
                    expectedRepos.length
                );

                expectedRepos.forEach((repo, index) => {
                    expect(fetchCredentialsMethod.stub.args[index][0]).to.equal(
                        repo.repoUri
                    );
                });
            });
        });

        it('should report failure and reject the promise if any one of the credential fetches fails', () => {
            const failIndex = _testValues.getNumber(10, 5);
            const expectedRepos = _getPrivateContainerRepos(failIndex * 2);
            _manifestMock.instance.privateContainerRepos = expectedRepos;

            const expectedError = 'Error fetching container credentials';

            const ret = _execHandler();

            _runUntilTask(Tasks.FETCH_CREDENTIALS)
                .then(() =>
                    _bulkComplete(
                        _credentialManagerMock.mocks.fetchContainerCredentials,
                        failIndex * 2,
                        failIndex
                    )
                )
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
        });

        it('should create secrets for every target specified', () => {
            const createImagePullSecretMethod =
                _credentialManagerMock.mocks.createImagePullSecret;

            const repoCount = _testValues.getNumber(10, 5);
            const expectedRepos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = expectedRepos;

            expect(createImagePullSecretMethod.stub).to.not.have.been.called;

            _execHandler();

            return _runUntilTask(Tasks.CREATE_IMAGE_PULL_SECRETS).then(
                (credentials) => {
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
                }
            );
        });

        it('should report failure and reject the promise if any one of the secret creations fails', () => {
            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const expectedError = 'Error creating image pull secrets';

            const ret = _execHandler();

            _runUntilTask(Tasks.CREATE_IMAGE_PULL_SECRETS)
                .then((credentials) => {
                    const secretList = _buildSecretList(credentials, repos);
                    const failIndex = _testValues.getNumber(secretList.length);

                    return _bulkComplete(
                        _credentialManagerMock.mocks.createImagePullSecret,
                        secretList.length,
                        failIndex
                    );
                })
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
        });

        it('should patch the service account with the correct image pull secrets', () => {
            const applyImagePullSecretsMethod =
                _credentialManagerMock.mocks.applyImagePullSecrets;

            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            expect(applyImagePullSecretsMethod.stub).to.not.have.been.called;

            _execHandler();

            return _runUntilTask(Tasks.APPLY_IMAGE_PULL_SECRETS).then(() => {
                const serviceAccountList = _buildServiceAccountList(repos);
                expect(applyImagePullSecretsMethod.stub).to.have.been.called;
                expect(applyImagePullSecretsMethod.stub.callCount).to.equal(
                    serviceAccountList.length
                );

                serviceAccountList.forEach((serviceAccount, index) => {
                    const args = applyImagePullSecretsMethod.stub.args[index];
                    expect(args[0]).to.equal(serviceAccount.serviceAccount);
                    expect(args[1]).to.deep.equal(serviceAccount.secrets);
                    expect(args[2]).to.deep.equal(serviceAccount.namespace);
                });
            });
        });

        it('should report failure and reject the promise if any one of the apply operations fails', () => {
            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const expectedError = 'Error applying image pull secrets';

            const ret = _execHandler();

            _runUntilTask(Tasks.APPLY_IMAGE_PULL_SECRETS)
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
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
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

            return _runUntilTask(Tasks.UNINSTALL_COMPONENTS).then(() => {
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

            const args = {
                dryRunUninstall: _testValues.getNumber(1, 10) < 5
            };

            _execHandler(args);

            return _runUntilTask(Tasks.UNINSTALL_COMPONENTS).then(() => {
                expect(uninstallMethod.stub).to.have.been.called;
                expect(uninstallMethod.stub.callCount).to.equal(uninstallCount);
                uninstallRecords.forEach((record, index) => {
                    expect(uninstallMethod.stub.args[index]).to.have.length(2);
                    expect(uninstallMethod.stub.args[index][0]).to.be.true;
                    expect(uninstallMethod.stub.args[index][1]).to.equal(
                        args.dryRunUninstall
                    );
                });
            });
        });

        it('should report failure and reject the promise if any one of the uninstalls fails', () => {
            const repoCount = _testValues.getNumber(10, 5);
            const repos = _getPrivateContainerRepos(repoCount);
            _manifestMock.instance.privateContainerRepos = repos;

            const failIndex = _testValues.getNumber(10, 5);
            const uninstallRecords = _getUninstallRecords(failIndex * 2);
            _manifestMock.instance.uninstallRecords = uninstallRecords;

            const expectedError = 'Error uninstalling component';

            const ret = _execHandler();

            _runUntilTask(Tasks.UNINSTALL_COMPONENTS)
                .then(() =>
                    _bulkComplete(
                        _helmMock.mocks.uninstall,
                        failIndex * 2,
                        failIndex
                    )
                )
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
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

            return _runUntilTask(Tasks.INSTALL_COMPONENTS).then(() => {
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

            const args = {
                dryRunInstall: _testValues.getNumber(1, 10) < 5
            };

            _execHandler(args);

            return _runUntilTask(Tasks.INSTALL_COMPONENTS).then(() => {
                expect(installMethod.stub).to.have.been.called;
                expect(installMethod.stub.callCount).to.equal(installCount);
                installRecords.forEach((installRecord, index) => {
                    const installArgs = installMethod.stub.args[index];
                    expect(installArgs).to.have.length(2);
                    expect(installArgs[0]).to.deep.equal(installRecord);
                    expect(installArgs[1]).to.equal(args.dryRunInstall);
                });
            });
        });

        it('should report failure and reject the promise if any one of the installs fails', () => {
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

            const ret = _execHandler();

            _runUntilTask(Tasks.INSTALL_COMPONENTS)
                .then(() =>
                    _bulkComplete(
                        _helmMock.mocks.install,
                        failIndex * 2,
                        failIndex
                    )
                )
                .finally(() => _reporterMock.mocks.flush.resolve());

            return expect(ret)
                .to.be.rejectedWith(expectedError)
                .then(_verifyCleanup());
        });

        it('should handle flush errors gracefully', () => {
            const flushMethod = _reporterMock.mocks.flush;
            const loadMethod = _manifestMock.mocks.load;

            expect(flushMethod.stub).to.not.have.been.called;
            const ret = _execHandler();

            _runUntilTask(Tasks.LOAD_MANIFEST)
                .then(() =>
                    loadMethod.reject(new Error('something went wrong'))
                )
                .then(undefined, (err) => {
                    // Eat this exception to avoid warnings.
                    // We are checking for rejection later.
                })
                .then(() =>
                    _reporterMock.mocks.flush
                        .reject(new Error('flush failed'))
                        .catch((ex) => {
                            // Eat this exception to avoid warnings.
                            // We are checking for rejection later.
                        })
                );

            return expect(ret).to.be.rejected;
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

            _runUntilTask(Tasks.END).then(() =>
                _reporterMock.mocks.flush.resolve()
            );

            return expect(ret).to.be.fulfilled.then(() => {
                expect(successMethod.stub).to.have.been.calledOnce;
                expect(flushMethod.stub).to.have.been.calledOnce;
            });
        });
    });
});
