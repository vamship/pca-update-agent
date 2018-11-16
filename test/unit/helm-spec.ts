import { default as _chai, expect } from 'chai';
import _chaiAsPromised from 'chai-as-promised';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);
_chai.use(_chaiAsPromised);
import 'mocha';

import _rewire from 'rewire';
import _sinon from 'sinon';

import { ObjectMock, testValues as _testValues } from '@vamship/test-utils';

const _helmModule = _rewire('../../src/helm');
const Helm = _helmModule.default;

describe('Helm', () => {
    function _createHelm(releaseName?: string) {
        releaseName = releaseName || _testValues.getString('releaseName');
        return new Helm(releaseName);
    }

    let _execaMock;

    beforeEach(() => {
        _execaMock = new ObjectMock().addPromiseMock('execa');

        _helmModule.__set__('execa_1', {
            default: _execaMock.instance.execa
        });
    });

    describe('ctor()', () => {
        it('should throw an error if invoked without a valid release name', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid releaseName (arg #1)';

            inputs.forEach((releaseName) => {
                const wrapper = () => {
                    return new Helm(releaseName);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should expose expected properties and methods', () => {
            const releaseName = _testValues.getString('releaseName');
            const helm = _createHelm(releaseName);

            expect(helm).to.be.an('object');
            expect(helm.install).to.be.a('function');
            expect(helm.uninstall).to.be.a('function');
        });
    });

    describe('install()', () => {
        it('should throw an error if invoked without valid install options', () => {
            const inputs = _testValues.allButObject();
            const error = 'Invalid chartInfo (arg #1)';

            inputs.forEach((chartInfo) => {
                const wrapper = () => {
                    const helm = _createHelm();
                    return helm.install(chartInfo);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if the install options does not define a valid chart name', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid chartName (chartInfo.chartName)';

            inputs.forEach((chartName) => {
                const wrapper = () => {
                    const helm = _createHelm();
                    const options = {
                        chartName
                    };
                    return helm.install(options);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if the install options does not define a valid namespace', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid namespace (chartInfo.namespace)';

            inputs.forEach((namespace) => {
                const wrapper = () => {
                    const helm = _createHelm();
                    const options = {
                        chartName: _testValues.getString('chartName'),
                        namespace
                    };
                    return helm.install(options);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should throw an error if the install options does not define valid setOptions', () => {
            const inputs = _testValues.allButArray();
            const error = 'Invalid setOptions (chartInfo.setOptions)';

            inputs.forEach((setOptions) => {
                const wrapper = () => {
                    const helm = _createHelm();
                    const options = {
                        chartName: _testValues.getString('chartName'),
                        namespace: _testValues.getString('namespace'),
                        setOptions
                    };
                    return helm.install(options);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should return a promise when invoked', () => {
            const helm = _createHelm();
            const ret = helm.install({
                chartName: _testValues.getString('chartName'),
                namespace: _testValues.getString('namespace'),
                setOptions: []
            });

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should invoke helm to install the chart', () => {
            const releaseName = _testValues.getString('releaseName');
            const helm = _createHelm(releaseName);
            const execaMethod = _execaMock.mocks.execa;

            const namespace = _testValues.getString('namespace');
            const chartName = _testValues.getString('chartName');
            const setOptions = new Array(10).fill(0).map(() => ({
                key: _testValues.getString('key'),
                value: _testValues.getString('value')
            }));
            const setArgs = setOptions
                .map(({ key, value }) => `${key}=${value}`)
                .join(',');

            expect(execaMethod.stub).to.not.have.been.called;
            helm.install({
                chartName,
                namespace,
                setOptions
            });

            expect(execaMethod.stub).to.have.been.calledOnce;
            expect(execaMethod.stub.args[0]).to.have.length(2);

            expect(execaMethod.stub.args[0][0]).to.equal('helm');
            expect(execaMethod.stub.args[0][1]).to.deep.equal([
                `upgrade`,
                releaseName,
                chartName,
                '--install',
                '--debug',
                '--tls',
                `--namespace=${namespace}`,
                `--set=${setArgs}`
            ]);
        });

        it('should omit the set argument if the set options are empty', () => {
            const releaseName = _testValues.getString('releaseName');
            const chartName = _testValues.getString('chartName');
            const namespace = _testValues.getString('namespace');
            const setOptions = [];
            const helm = _createHelm(releaseName);
            const execaMethod = _execaMock.mocks.execa;

            expect(execaMethod.stub).to.not.have.been.called;
            helm.install({
                chartName,
                namespace,
                setOptions
            });

            expect(execaMethod.stub).to.have.been.calledOnce;
            expect(execaMethod.stub.args[0]).to.have.length(2);

            expect(execaMethod.stub.args[0][0]).to.equal('helm');
            expect(execaMethod.stub.args[0][1]).to.deep.equal([
                `upgrade`,
                releaseName,
                chartName,
                '--install',
                '--debug',
                '--tls',
                `--namespace=${namespace}`
            ]);
        });

        it('should reject the promise if command execution fails', () => {
            const helm = _createHelm();
            const execaMethod = _execaMock.mocks.execa;
            const error = new Error('something went wrong!');

            const ret = helm.install({
                chartName: _testValues.getString('chartName'),
                namespace: _testValues.getString('namespace'),
                setOptions: []
            });
            execaMethod.reject(error);

            return expect(ret).to.be.rejectedWith(error);
        });

        it('should resolve the promise if command execution succeeds', () => {
            const helm = _createHelm();
            const execaMethod = _execaMock.mocks.execa;

            const ret = helm.install({
                chartName: _testValues.getString('chartName'),
                namespace: _testValues.getString('namespace'),
                setOptions: []
            });
            execaMethod.resolve();

            return expect(ret).to.be.fulfilled;
        });
    });

    describe('uninstall()', () => {
        it('should return a promise when invoked', () => {
            const helm = _createHelm();
            const ret = helm.uninstall({});

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should invoke helm to delete the chart', () => {
            const releaseName = _testValues.getString('releaseName');
            const helm = _createHelm(releaseName);
            const execaMethod = _execaMock.mocks.execa;

            expect(execaMethod.stub).to.not.have.been.called;
            helm.uninstall(true);

            expect(execaMethod.stub).to.have.been.calledOnce;
            expect(execaMethod.stub.args[0]).to.have.length(2);

            expect(execaMethod.stub.args[0][0]).to.equal('helm');
            expect(execaMethod.stub.args[0][1]).to.deep.equal([
                `delete`,
                releaseName,
                '--tls',
                `--purge`
            ]);
        });

        it('should omit the purge argument if purge=false', () => {
            const releaseName = _testValues.getString('releaseName');
            const helm = _createHelm(releaseName);
            const execaMethod = _execaMock.mocks.execa;

            expect(execaMethod.stub).to.not.have.been.called;
            helm.uninstall(false);

            expect(execaMethod.stub).to.have.been.calledOnce;
            expect(execaMethod.stub.args[0]).to.have.length(2);

            expect(execaMethod.stub.args[0][0]).to.equal('helm');
            expect(execaMethod.stub.args[0][1]).to.deep.equal([
                `delete`,
                releaseName,
                '--tls'
            ]);
        });

        it('should reject the promise if command execution fails', () => {
            const helm = _createHelm();
            const execaMethod = _execaMock.mocks.execa;
            const error = new Error('something went wrong!');

            const ret = helm.uninstall();
            execaMethod.reject(error);

            return expect(ret).to.be.rejectedWith(error);
        });

        it('should resolve the promise if command execution succeeds', () => {
            const helm = _createHelm();
            const execaMethod = _execaMock.mocks.execa;

            const ret = helm.uninstall();
            execaMethod.resolve();

            return expect(ret).to.be.fulfilled;
        });
    });
});
