import { default as _chai, expect } from 'chai';
import _chaiAsPromised from 'chai-as-promised';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);
_chai.use(_chaiAsPromised);
import 'mocha';

import _rewire from 'rewire';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';

const _reporterModule = _rewire('../../src/reporter');
const Reporter = _reporterModule.default;

describe('Reporter', () => {
    function _createReporter(endpoint?: string) {
        endpoint = endpoint || `https://${_testValues.getString('endpoint')}`;
        return new Reporter(endpoint);
    }

    let _isomorphicFetchMock;

    beforeEach(() => {
        _isomorphicFetchMock = new ObjectMock().addPromiseMock('fetch');
        _reporterModule.__set__('isomorphic_fetch_1', {
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
                    return new Reporter(endpoint);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should expose expected properties and methods', () => {
            const reporter = new Reporter(
                `https://${_testValues.getString('endpoint')}`
            );

            expect(reporter).to.be.an('object');
            expect(reporter.log).to.be.a('function');
            expect(reporter.success).to.be.a('function');
            expect(reporter.fail).to.be.a('function');
            expect(reporter.flush).to.be.a('function');

            // Test initialization of private members.
            expect(reporter._recordBuffer).to.deep.equal([]);
        });
    });

    ['log', 'success', 'fail'].forEach((methodName) => {
        describe(`${methodName}()`, () => {
            function _verifyRecord(record, startTime, message) {
                expect(record.kind).to.equal(methodName);
                expect(record.message).to.equal(message);
                expect(record.timestamp).to.be.within(startTime, Date.now());
            }
            it('should throw an error if invoked without a valid message', () => {
                const inputs = _testValues.allButString('');
                const error = 'Invalid message (arg #1)';

                inputs.forEach((message) => {
                    const wrapper = () => {
                        const reporter = _createReporter();
                        return reporter[methodName](message);
                    };

                    expect(wrapper).to.throw(error);
                });
            });

            it('should add the message to the internal message buffer with the correct attributes', () => {
                const reporter = _createReporter();
                const message = _testValues.getString('message');

                expect(reporter._recordBuffer).to.be.an('array').and.to.be
                    .empty;
                const startTime = Date.now();

                reporter[methodName](message);

                expect(reporter._recordBuffer).to.have.length(1);
                _verifyRecord(reporter._recordBuffer[0], startTime, message);
            });

            it('should append additional messages to the internal message buffer', () => {
                const reporter = _createReporter();
                const messages = [
                    _testValues.getString('message'),
                    _testValues.getString('message'),
                    _testValues.getString('message')
                ];

                expect(reporter._recordBuffer).to.be.an('array').and.to.be
                    .empty;
                const startTime = Date.now();

                messages.forEach((message) => {
                    reporter[methodName](message);
                });

                expect(reporter._recordBuffer).to.have.length(messages.length);
                reporter._recordBuffer.forEach((record, index) => {
                    _verifyRecord(record, startTime, messages[index]);
                });
            });
        });
    });

    describe('flush()', () => {
        function _verifyRecordBuffer(
            buffer: any[],
            startTime: number,
            logMessages?: string[],
            successMessages?: string[],
            failMessages?: string[]
        ) {
            logMessages = logMessages || [];
            successMessages = successMessages || [];
            failMessages = failMessages || [];

            expect(buffer).to.be.an('array');
            expect(buffer).to.have.length(
                logMessages.length +
                    successMessages.length +
                    failMessages.length
            );

            let baseIndex = 0;
            logMessages.forEach((message, index) => {
                const record = buffer[baseIndex + index];
                expect(record).to.be.an('object');
                expect(record.kind).to.equal('log');
                expect(record.message).to.equal(message);
                expect(record.timestamp).to.be.within(startTime, Date.now());
            });

            baseIndex += logMessages.length;
            successMessages.forEach((message, index) => {
                const record = buffer[baseIndex + index];
                expect(record).to.be.an('object');
                expect(record.kind).to.equal('success');
                expect(record.message).to.equal(message);
                expect(record.timestamp).to.be.within(startTime, Date.now());
            });

            baseIndex += successMessages.length;
            failMessages.forEach((message, index) => {
                const record = buffer[baseIndex + index];
                expect(record).to.be.an('object');
                expect(record.kind).to.equal('fail');
                expect(record.message).to.equal(message);
                expect(record.timestamp).to.be.within(startTime, Date.now());
            });
        }

        it('should return a promise when invoked', () => {
            const reporter = _createReporter();
            const ret = reporter.flush();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should resolve the promise with no HTTP requests if the buffer is empty', () => {
            const reporter = _createReporter();
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;

            expect(fetchMethod.stub).to.not.have.been.called;
            expect(reporter._recordBuffer).to.be.an('array').and.to.be.empty;
            const ret = reporter.flush();
            expect(reporter._recordBuffer).to.be.an('array').and.to.be.empty;
            expect(fetchMethod.stub).to.not.have.been.called;

            return expect(ret).to.be.fulfilled;
        });

        it('should make an HTTP post request to the callback endpoint with buffered records', () => {
            const endpoint = `https://${_testValues.getString('endpoint')}`;
            const reporter = _createReporter(endpoint);
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const logMessages = [
                _testValues.getString('log_1'),
                _testValues.getString('log_2'),
                _testValues.getString('log_2')
            ];
            const successMessages = [_testValues.getString('success')];
            const failMessages = [_testValues.getString('fail')];
            const startTime = Date.now();

            logMessages.forEach((message) => reporter.log(message));
            successMessages.forEach((message) => reporter.success(message));
            failMessages.forEach((message) => reporter.fail(message));

            expect(fetchMethod.stub).to.not.have.been.called;
            reporter.flush();
            expect(fetchMethod.stub).to.have.been.calledOnce;
            expect(fetchMethod.stub.args[0][0]).to.equal(endpoint);
            const options = fetchMethod.stub.args[0][1];
            expect(options).to.be.an('object');

            expect(options.method).to.equal('POST');
            expect(options.headers).to.deep.equal({
                'content-type': 'application/json'
            });

            const payload = JSON.parse(options.body);
            expect(payload).to.be.an('object');
            expect(payload).to.have.all.keys('messages');

            const {messages} = payload;

            _verifyRecordBuffer(
                messages,
                startTime,
                logMessages,
                successMessages,
                failMessages
            );
        });

        it('should empty out the record buffer after the request has been made', () => {
            const reporter = _createReporter();
            const logMessages = [
                _testValues.getString('log_1'),
                _testValues.getString('log_2'),
                _testValues.getString('log_2')
            ];
            const successMessages = [_testValues.getString('success')];
            const failMessages = [_testValues.getString('fail')];

            logMessages.forEach((message) => reporter.log(message));
            successMessages.forEach((message) => reporter.success(message));
            failMessages.forEach((message) => reporter.fail(message));

            reporter.flush();
            expect(reporter._recordBuffer).to.be.an('array').and.to.be.empty;
        });

        it('should reject the promise if the fetch method fails', () => {
            const reporter = _createReporter();
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const logMessages = [
                _testValues.getString('log_1'),
                _testValues.getString('log_2'),
                _testValues.getString('log_2')
            ];
            const error = new Error('something went wrong!');

            logMessages.forEach((message) => reporter.log(message));

            const ret = reporter.flush();
            fetchMethod.reject(error);
            return expect(ret).to.be.rejectedWith(error);
        });

        it('should restore the records to the buffer if the fetch method fails', () => {
            const reporter = _createReporter();
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const logMessages = [
                _testValues.getString('log_1'),
                _testValues.getString('log_2'),
                _testValues.getString('log_2')
            ];
            const successMessages = [_testValues.getString('success')];
            const failMessages = [_testValues.getString('fail')];
            const startTime = Date.now();
            const error = new Error('something went wrong!');

            logMessages.forEach((message) => reporter.log(message));
            successMessages.forEach((message) => reporter.success(message));
            failMessages.forEach((message) => reporter.fail(message));

            const ret = reporter.flush();
            expect(reporter._recordBuffer).to.be.an('array').and.to.be.empty;

            fetchMethod.reject(error);

            return expect(ret)
                .to.be.rejectedWith(error)
                .then(() => {
                    _verifyRecordBuffer(
                        reporter._recordBuffer,
                        startTime,
                        logMessages,
                        successMessages,
                        failMessages
                    );
                });
        });

        it('should prepend records on failure to any records written since flush was called', () => {
            const reporter = _createReporter();
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const oldLogMessages = [
                _testValues.getString('log_1'),
                _testValues.getString('log_2'),
                _testValues.getString('log_2')
            ];
            const logMessages = [
                _testValues.getString('log_1'),
                _testValues.getString('log_2'),
                _testValues.getString('log_2')
            ];
            const successMessages = [_testValues.getString('success')];
            const failMessages = [_testValues.getString('fail')];
            const startTime = Date.now();
            const error = new Error('something went wrong!');

            oldLogMessages.forEach((message) => reporter.log(message));

            const ret = reporter.flush();
            expect(reporter._recordBuffer).to.be.an('array').and.to.be.empty;

            logMessages.forEach((message) => reporter.log(message));
            successMessages.forEach((message) => reporter.success(message));
            failMessages.forEach((message) => reporter.fail(message));

            fetchMethod.reject(error);

            return expect(ret)
                .to.be.rejectedWith(error)
                .then(() => {
                    _verifyRecordBuffer(
                        reporter._recordBuffer,
                        startTime,
                        oldLogMessages.concat(logMessages),
                        successMessages,
                        failMessages
                    );
                });
        });

        it('should resolve the promise if the fetch method succeeds', () => {
            const reporter = _createReporter();
            const fetchMethod = _isomorphicFetchMock.mocks.fetch;
            const logMessages = [
                _testValues.getString('log_1'),
                _testValues.getString('log_2'),
                _testValues.getString('log_2')
            ];
            logMessages.forEach((message) => reporter.log(message));

            const ret = reporter.flush();
            fetchMethod.resolve();
            return expect(ret).to.be.fulfilled.then(() => {
                expect(reporter._recordBuffer)
                    .to.be.an('array')
                    .and.to.have.length(0);
            });
        });
    });
});
