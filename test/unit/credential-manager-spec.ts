import { default as _chai, expect } from 'chai';
import _chaiAsPromised from 'chai-as-promised';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);
_chai.use(_chaiAsPromised);
import 'mocha';

import _rewire from 'rewire';
import _sinon from 'sinon';

import {
    asyncHelper as _asyncHelper,
    ObjectMock,
    testValues as _testValues
} from '@vamship/test-utils';
import { Promise } from 'bluebird';

import { IContainerCredentials } from '../../src/types';

const _credentialMangerModule = _rewire('../../src/credential-manager');
const CredentialManager = _credentialMangerModule.default;

describe('CredentialManager', () => {
    function _createCredentialManager(endpoint?: string, authToken?: string) {
        endpoint = endpoint || `https://${_testValues.getString('endpoint')}`;
        authToken = authToken || _testValues.getString('authToken');
        return new CredentialManager(endpoint, authToken);
    }

    function _getCredentials(): IContainerCredentials {
        return {
            server: _testValues.getString('server'),
            username: _testValues.getString('username'),
            password: _testValues.getString('password'),
            email: `${_testValues.getString('email')}@foo.com`
        };
    }

    let _isomorphicFetchMock;
    let _execaMock;

    beforeEach(() => {
        _isomorphicFetchMock = new ObjectMock().addPromiseMock('fetch');
        _credentialMangerModule.__set__('isomorphic_fetch_1', {
            default: _isomorphicFetchMock.instance.fetch
        });

        _execaMock = new ObjectMock().addPromiseMock('execa');

        _credentialMangerModule.__set__('execa_1', {
            default: _execaMock.instance.execa
        });
    });

    describe('ctor()', () => {
        it('should throw an error if invoked without a valid endpoint', () => {
            const inputs = _testValues.allButString(
                '',
                'foo',
                'bar',
                'http://',
                'https://'
            );
            const error = 'Invalid endpoint (arg #1)';

            inputs.forEach((endpoint) => {
                const wrapper = () => {
                    return new CredentialManager(endpoint);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if invoked without a valid authToken', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid authToken (arg #2)';

            inputs.forEach((authToken) => {
                const wrapper = () => {
                    const endpoint = `https://${_testValues.getString(
                        'endpoint'
                    )}`;
                    return new CredentialManager(endpoint, authToken);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should expose expected properties and methods', () => {
            const credMgr = new CredentialManager(
                `https://${_testValues.getString('endpoint')}`,
                _testValues.getString('authToken')
            );

            expect(credMgr).to.be.an('object');
            expect(credMgr.fetchContainerCredentials).to.be.a('function');
            expect(credMgr.createImagePullSecret).to.be.a('function');
            expect(credMgr.applyImagePullSecrets).to.be.a('function');
        });
    });

    describe('fetchContainerCredentials()', () => {
        function _invokeFetchCredentials(repoUri?: string, credMgr?: any) {
            repoUri = repoUri || _testValues.getString('repoUri');
            credMgr = credMgr || _createCredentialManager();
            return credMgr.fetchContainerCredentials(repoUri);
        }

        it('should throw an error if invoked without a valid repoUri', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid repoUri (arg #1)';

            inputs.forEach((repoUri) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    return credMgr.fetchContainerCredentials(repoUri);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should return a promise when invoked', () => {
            const ret = _invokeFetchCredentials();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should make an HTTP request to the credential provider endpoint', () => {
            const endpoint = `https://${_testValues.getString('endpoint')}`;
            const authToken = _testValues.getString('authToken');
            const credMgr = _createCredentialManager(endpoint, authToken);
            const repoUri = _testValues.getString('repoUri');
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const expectedEndpoint = `${endpoint}/container/${repoUri}`;

            expect(fetchMethod.stub).to.not.have.been.called;

            _invokeFetchCredentials(repoUri, credMgr);

            expect(fetchMethod.stub).to.have.been.calledOnce;
            expect(fetchMethod.stub.args[0][0]).to.equal(expectedEndpoint);
            expect(fetchMethod.stub.args[0][1]).to.deep.equal({
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    authorization: authToken
                }
            });
        });

        it('should reject the promise if the fetch call fails', () => {
            const error = new Error('something went wrong!');
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;

            const ret = _invokeFetchCredentials();
            fetchMethod.reject(error);

            return expect(ret).to.be.rejectedWith(error);
        });

        it('should convert the response into JSON', () => {
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const credentials = _getCredentials();

            _invokeFetchCredentials();
            const jsonMethod = _sinon.stub().resolves(credentials);
            fetchMethod.resolve({
                json: jsonMethod
            });

            return _asyncHelper
                .wait(10)()
                .then(() => {
                    expect(jsonMethod).to.have.been.calledOnce;
                    expect(jsonMethod).to.have.been.calledWithExactly();
                });
        });

        it('should reject the promise if response parsing fails', () => {
            const error = 'Error parsing credential provider response';
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;

            const ret = _invokeFetchCredentials();

            const jsonMethod = _sinon.stub().rejects('something went wrong');
            fetchMethod.resolve({
                json: jsonMethod
            });

            return expect(ret).to.be.rejectedWith(error);
        });

        it('should reject the promise if the credentials does not define a docker server', () => {
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (server, index) => {
                const credentials = _getCredentials();
                credentials.server = server;

                fetchMethod.reset();
                const ret = _invokeFetchCredentials();

                const jsonMethod = _sinon.stub().resolves(credentials);
                fetchMethod.resolve(
                    {
                        json: jsonMethod
                    },
                    index
                );

                return expect(ret).to.be.rejectedWith(
                    /.*Container credentials do not conform to expected schema.*server.*/
                );
            });
        });

        it('should reject the promise if the credentials does not define a username', () => {
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (username, index) => {
                const credentials = _getCredentials();
                credentials.username = username;

                fetchMethod.reset();
                const ret = _invokeFetchCredentials();

                const jsonMethod = _sinon.stub().resolves(credentials);
                fetchMethod.resolve(
                    {
                        json: jsonMethod
                    },
                    index
                );

                return expect(ret).to.be.rejectedWith(
                    /.*Container credentials do not conform to expected schema.*username.*/
                );
            });
        });

        it('should reject the promise if the credentials does not define a docker password', () => {
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (password, index) => {
                const credentials = _getCredentials();
                credentials.password = password;

                fetchMethod.reset();
                const ret = _invokeFetchCredentials();

                const jsonMethod = _sinon.stub().resolves(credentials);
                fetchMethod.resolve(
                    {
                        json: jsonMethod
                    },
                    index
                );

                return expect(ret).to.be.rejectedWith(
                    /.*Container credentials do not conform to expected schema.*password.*/
                );
            });
        });

        it('should reject the promise if the credentials does not define a docker email', () => {
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const inputs = _testValues.allButString('', 'foo', 'bar');

            return Promise.map(inputs, (email, index) => {
                const credentials = _getCredentials();
                credentials.email = email;

                fetchMethod.reset();
                const ret = _invokeFetchCredentials();

                const jsonMethod = _sinon.stub().resolves(credentials);
                fetchMethod.resolve(
                    {
                        json: jsonMethod
                    },
                    index
                );

                return expect(ret).to.be.rejectedWith(
                    /.*Container credentials do not conform to expected schema.*email.*/
                );
            });
        });

        it('should return the credentials if all checks succeed', () => {
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const credentials = _getCredentials();

            const ret = _invokeFetchCredentials();
            const jsonMethod = _sinon.stub().resolves(credentials);

            fetchMethod.resolve({
                json: jsonMethod
            });

            expect(ret).to.be.fulfilled.then((data) => {
                expect(data).to.deep.equal(credentials);
            });
        });
    });

    describe('createImagePullSecret()', () => {
        function _invokeCreateSecret(
            secretName?: string,
            credentials?: any,
            namespace?: string,
            credMgr?: any
        ) {
            credentials = credentials || _getCredentials();
            secretName = secretName || _testValues.getString('secretName');
            if (namespace === 'UNDEFINED') {
                namespace = undefined;
            } else {
                namespace = namespace || _testValues.getString('namespace');
            }

            credMgr = credMgr || _createCredentialManager();
            return credMgr.createImagePullSecret(
                secretName,
                credentials,
                namespace
            );
        }

        it('should throw an error if invoked without a valid secretName', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid secretName (arg #1)';

            inputs.forEach((secretName) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    return credMgr.createImagePullSecret(secretName);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if invoked without valid container credentials', () => {
            const inputs = _testValues.allButObject();
            const error = 'Invalid containerCredentials (arg #2)';

            inputs.forEach((credentials) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    const secretName = _testValues.getString('secretName');
                    return credMgr.createImagePullSecret(
                        secretName,
                        credentials
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should reject the promise if the credentials does not define a server', () => {
            const error = 'Invalid server (containerCredentials.server)';
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (server, index) => {
                const wrapper = () => {
                    const secretName = _testValues.getString('secretName');
                    const credentials = _getCredentials();
                    credentials.server = server;
                    const credMgr = _createCredentialManager();
                    return credMgr.createImagePullSecret(
                        secretName,
                        credentials
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should reject the promise if the credentials does not define a username', () => {
            const error = 'Invalid username (containerCredentials.username)';
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (username, index) => {
                const wrapper = () => {
                    const secretName = _testValues.getString('secretName');
                    const credentials = _getCredentials();
                    credentials.username = username;
                    const credMgr = _createCredentialManager();
                    return credMgr.createImagePullSecret(
                        secretName,
                        credentials
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should reject the promise if the credentials does not define a password', () => {
            const error = 'Invalid password (containerCredentials.password)';
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (password, index) => {
                const wrapper = () => {
                    const secretName = _testValues.getString('secretName');
                    const credentials = _getCredentials();
                    credentials.password = password;
                    const credMgr = _createCredentialManager();
                    return credMgr.createImagePullSecret(
                        secretName,
                        credentials
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should reject the promise if the credentials does not define an email', () => {
            const error = 'Invalid email (containerCredentials.email)';
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (email, index) => {
                const wrapper = () => {
                    const secretName = _testValues.getString('secretName');
                    const credentials = _getCredentials();
                    credentials.email = email;
                    const credMgr = _createCredentialManager();
                    return credMgr.createImagePullSecret(
                        secretName,
                        credentials
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if invoked with an invalid namespace', () => {
            const inputs = _testValues
                .allButSelected('undefined', 'string')
                .concat(['']);
            const error = 'Invalid namespace (arg #3)';

            inputs.forEach((namespace) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    const credentials = _getCredentials();
                    const secretName = _testValues.getString('secretName');

                    return credMgr.createImagePullSecret(
                        secretName,
                        credentials,
                        namespace
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should not throw an error if the namespace is undefined', () => {
            const wrapper = () => {
                const credMgr = _createCredentialManager();
                const credentials = _getCredentials();
                const secretName = _testValues.getString('secretName');

                return credMgr.createImagePullSecret(
                    secretName,
                    credentials,
                    undefined
                );
            };

            expect(wrapper).to.not.throw();
        });

        it('should return a promise when invoked', () => {
            const ret = _invokeCreateSecret();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should delete the existing secret using kubectl', () => {
            const execaMethod = _execaMock.mocks.execa;
            const secretName = _testValues.getString('secretName');
            const namespace = _testValues.getString('namespace');

            expect(execaMethod.stub).to.not.have.been.called;
            _invokeCreateSecret(secretName, undefined, namespace);

            return _asyncHelper
                .wait(10)()
                .then(() => {
                    expect(execaMethod.stub).to.have.been.called;
                    expect(execaMethod.stub.callCount).to.be.at.least(1);
                    expect(execaMethod.stub.args[0]).to.have.length(2);
                    expect(execaMethod.stub.args[0][0]).to.equal('kubectl');
                    expect(execaMethod.stub.args[0][1]).to.deep.equal([
                        'delete',
                        'secret',
                        '--ignore-not-found',
                        `--namespace=${namespace}`,
                        secretName
                    ]);
                });
        });

        it('should omit the namespace attribute if the namespace is not specified', () => {
            const execaMethod = _execaMock.mocks.execa;
            const secretName = _testValues.getString('secretName');

            expect(execaMethod.stub).to.not.have.been.called;
            _invokeCreateSecret(secretName, undefined, 'UNDEFINED');

            return _asyncHelper
                .wait(10)()
                .then(() => {
                    expect(execaMethod.stub).to.have.been.called;
                    expect(execaMethod.stub.callCount).to.be.at.least(1);
                    expect(execaMethod.stub.args[0]).to.have.length(2);
                    expect(execaMethod.stub.args[0][0]).to.equal('kubectl');
                    expect(execaMethod.stub.args[0][1]).to.deep.equal([
                        'delete',
                        'secret',
                        '--ignore-not-found',
                        secretName
                    ]);
                });
        });

        it('should reject the promise if the delete operation fails', () => {
            const secretName = _testValues.getString('secretName');
            const error = `Error deleting secret: [${secretName}]`;
            const execaMethod = _execaMock.mocks.execa;

            const ret = _invokeCreateSecret(secretName);
            execaMethod.reject('something went wrong').catch((ex) => {
                // Eat this error, we're checking for rejection later.
            });

            return expect(ret).to.be.rejectedWith(error);
        });

        it('should create a new secret using kubectl', () => {
            const execaMethod = _execaMock.mocks.execa;
            const credentials = _getCredentials();
            const secretName = _testValues.getString('secretName');
            const namespace = _testValues.getString('namespace');

            expect(execaMethod.stub).to.not.have.been.called;
            _invokeCreateSecret(secretName, credentials, namespace);

            execaMethod.resolve(undefined, 0);
            return _asyncHelper
                .wait(10)()
                .then(() => execaMethod.promise(0))
                .then(() => {
                    expect(execaMethod.stub).to.have.been.called;
                    expect(execaMethod.stub.callCount).to.be.at.least(2);
                    expect(execaMethod.stub.args[1]).to.have.length(2);
                    expect(execaMethod.stub.args[1][0]).to.equal('kubectl');
                    expect(execaMethod.stub.args[1][1]).to.deep.equal([
                        'create',
                        'secret',
                        'docker-registry',
                        `--namespace=${namespace}`,
                        secretName,
                        `--docker-server=${credentials.server}`,
                        `--docker-username=${credentials.username}`,
                        `--docker-password=${credentials.password}`,
                        `--docker-email=${credentials.email}`
                    ]);
                });
        });

        it('should omit the namespace attribute if the namespace is not specified', () => {
            const execaMethod = _execaMock.mocks.execa;
            const credentials = _getCredentials();
            const secretName = _testValues.getString('secretName');

            expect(execaMethod.stub).to.not.have.been.called;
            _invokeCreateSecret(secretName, credentials, 'UNDEFINED');

            execaMethod.resolve(undefined, 0);
            return _asyncHelper
                .wait(10)()
                .then(() => execaMethod.promise(0))
                .then(() => {
                    expect(execaMethod.stub).to.have.been.called;
                    expect(execaMethod.stub.callCount).to.be.at.least(2);
                    expect(execaMethod.stub.args[1]).to.have.length(2);
                    expect(execaMethod.stub.args[1][0]).to.equal('kubectl');
                    expect(execaMethod.stub.args[1][1]).to.deep.equal([
                        'create',
                        'secret',
                        'docker-registry',
                        secretName,
                        `--docker-server=${credentials.server}`,
                        `--docker-username=${credentials.username}`,
                        `--docker-password=${credentials.password}`,
                        `--docker-email=${credentials.email}`
                    ]);
                });
        });

        it('should reject the promise if the create operation fails', () => {
            const secretName = _testValues.getString('secretName');
            const error = `Error creating secret: [${secretName}]`;
            const execaMethod = _execaMock.mocks.execa;

            const ret = _invokeCreateSecret(secretName);

            execaMethod.resolve(undefined, 0);
            return execaMethod.promise(0).then(() => {
                execaMethod.reject('something went wrong', 1);
                return expect(ret).to.be.rejectedWith(error);
            });
        });

        it('should resolve the promise if the create operation succeeds', () => {
            const execaMethod = _execaMock.mocks.execa;

            const ret = _invokeCreateSecret();

            execaMethod.resolve(undefined, 0);
            execaMethod.resolve(undefined, 1);
            return _asyncHelper
                .wait(10)()
                .then(() => execaMethod.promise(0))
                .then(() => execaMethod.promise(1))
                .then(() => {
                    return expect(ret).to.be.fulfilled;
                });
        });
    });

    describe('applyImagePullSecrets()', () => {
        function _invokeApplySecret(
            serviceAccount?: string,
            secrets?: any,
            namespace?: string,
            credMgr?: any
        ) {
            serviceAccount =
                serviceAccount || _testValues.getString('serviceAccount');
            secrets =
                secrets ||
                new Array(10).fill(0).map((item, index) => {
                    return _testValues.getString(`secrets_${index}`);
                });
            if (namespace === 'UNDEFINED') {
                namespace = undefined;
            } else {
                namespace = namespace || _testValues.getString('namespace');
            }

            credMgr = credMgr || _createCredentialManager();
            return credMgr.applyImagePullSecrets(
                serviceAccount,
                secrets,
                namespace
            );
        }

        it('should throw an error if invoked without a valid serviceAccount', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid serviceAccount (arg #1)';

            inputs.forEach((serviceAccount) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    return credMgr.applyImagePullSecrets(serviceAccount);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if invoked without a valid secrets array', () => {
            const inputs = _testValues.allButArray();
            const error = 'Invalid secrets (arg #2)';

            inputs.forEach((secrets) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    const serviceAccount = _testValues.getString(
                        'serviceAccount'
                    );
                    return credMgr.applyImagePullSecrets(
                        serviceAccount,
                        secrets
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if invoked with an invalid namespace', () => {
            const inputs = _testValues
                .allButSelected('undefined', 'string')
                .concat(['']);
            const error = 'Invalid namespace (arg #3)';

            inputs.forEach((namespace) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    const serviceAccount = _testValues.getString(
                        'serviceAccount'
                    );
                    const secrets = new Array(5).fill(0).map((item, index) => {
                        return _testValues.getString(`secret_${index}`);
                    });

                    return credMgr.applyImagePullSecrets(
                        serviceAccount,
                        secrets,
                        namespace
                    );
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should not throw an error if the namespace is undefined', () => {
            const wrapper = () => {
                const credMgr = _createCredentialManager();
                const serviceAccount = _testValues.getString('serviceAccount');
                const secrets = new Array(5).fill(0).map((item, index) => {
                    return _testValues.getString(`secret_${index}`);
                });

                return credMgr.applyImagePullSecrets(
                    serviceAccount,
                    secrets,
                    undefined
                );
            };

            expect(wrapper).to.not.throw();
        });

        it('should patch the secret into the serviceAccount', () => {
            const execaMethod = _execaMock.mocks.execa;
            const serviceAccount = _testValues.getString('serviceAccount');
            const secrets = new Array(5).fill(0).map((item, index) => {
                return _testValues.getString(`secret_${index}`);
            });
            const namespace = _testValues.getString('namespace');

            expect(execaMethod.stub).to.not.have.been.called;
            _invokeApplySecret(serviceAccount, secrets, namespace);

            const patch = JSON.stringify({
                imagePullSecrets: secrets.map((secret) => ({
                    name: secret
                }))
            });
            expect(execaMethod.stub).to.have.been.calledOnce;
            expect(execaMethod.stub.args[0]).to.have.length(2);
            expect(execaMethod.stub.args[0][0]).to.equal('kubectl');
            expect(execaMethod.stub.args[0][1]).to.deep.equal([
                'patch',
                'serviceaccount',
                `--namespace=${namespace}`,
                serviceAccount,
                `-p=${patch}`
            ]);
        });

        it('should return a promise when invoked', () => {
            const ret = _invokeApplySecret();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should reject the promise if the apply operation fails', () => {
            const serviceAccount = _testValues.getString('serviceAccount');
            const namespace = _testValues.getString('namespace');
            const error = `Error applying secrets to: [${serviceAccount}, ${namespace}]`;
            const execaMethod = _execaMock.mocks.execa;

            const ret = _invokeApplySecret(
                serviceAccount,
                undefined,
                namespace
            );

            execaMethod.reject('something went wrong', 0);
            return expect(ret).to.be.rejectedWith(error);
        });

        it('should resolve the promise if the create operation succeeds', () => {
            const execaMethod = _execaMock.mocks.execa;

            const ret = _invokeApplySecret();

            execaMethod.resolve(undefined, 0);
            return expect(ret).to.be.fulfilled;
        });
    });
});
