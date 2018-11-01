import { default as _chai, expect } from 'chai';
import _chaiAsPromised from 'chai-as-promised';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);
_chai.use(_chaiAsPromised);
import 'mocha';

import _rewire from 'rewire';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';

const _credentialMangerModule = _rewire('../../src/credential-manager');
const CredentialManager = _credentialMangerModule.default;

describe('CredentialManager', () => {
    function _createCredentialManager(endpoint?: string, authToken?: string) {
        endpoint = endpoint || `https://${_testValues.getString('endpoint')}`;
        authToken = authToken || _testValues.getString('authToken');
        return new CredentialManager(endpoint, authToken);
    }

    let _isomorphicFetchMock;

    beforeEach(() => {
        _isomorphicFetchMock = new ObjectMock().addPromiseMock('fetch');
        _credentialMangerModule.__set__('isomorphic_fetch_1', {
            default: _isomorphicFetchMock.instance.fetch
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
            expect(credMgr.applyCredentials).to.be.a('function');
        });
    });

    describe('applyCredentials()', () => {
        it('should throw an error if invoked without a valid kind', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid kind (arg #1)';

            inputs.forEach((kind) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    return credMgr.applyCredentials(kind);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if invoked without a valid resourceId', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid resourceId (arg #2)';

            inputs.forEach((resourceId) => {
                const wrapper = () => {
                    const credMgr = _createCredentialManager();
                    const kind = _testValues.getString('kind');
                    return credMgr.applyCredentials(kind, resourceId);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should return a promise when invoked', () => {
            const credMgr = _createCredentialManager();
            const kind = _testValues.getString('kind');
            const resourceId = _testValues.getString('resourceId');
            const ret = credMgr.applyCredentials(kind, resourceId);

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should make an HTTP request to the credential provider endpoint', () => {
            const endpoint = `https://${_testValues.getString('endpoint')}`;
            const authToken = _testValues.getString('authToken');
            const credMgr = _createCredentialManager(endpoint, authToken);
            const kind = _testValues.getString('kind');
            const resourceId = _testValues.getString('resourceId');
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;

            expect(fetchMethod.stub).to.not.have.been.called;

            credMgr.applyCredentials(kind, resourceId);

            expect(fetchMethod.stub).to.have.been.calledOnce;
            expect(fetchMethod.stub.args[0][0]).to.equal(endpoint);
            expect(fetchMethod.stub.args[0][1]).to.deep.equal({
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    authorization: authToken
                }
            });
        });

        it('should reject the promise if the fetch call fails', () => {
            const credMgr = _createCredentialManager();
            const kind = _testValues.getString('kind');
            const resourceId = _testValues.getString('resourceId');
            const error = new Error('something went wrong!');
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;

            const ret = credMgr.applyCredentials(kind, resourceId);
            fetchMethod.reject(error);

            return expect(ret).to.be.rejectedWith(error);
        });
        /// TODO: More functionality is required.
    });
});
