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

const _manifestModule = _rewire('../../src/manifest');
const Manifest = _manifestModule.default;

describe('Manifest', () => {
    function _createManifest(filePath?: string) {
        filePath = filePath || _testValues.getString('filePath');
        return new Manifest(filePath);
    }
    let _fsMock;

    beforeEach(() => {
        _fsMock = new ObjectMock().addMock('readFile');

        _manifestModule.__set__('fs_1', {
            default: _fsMock.instance
        });
    });

    describe('ctor()', () => {
        it('should throw an error if invoked without a valid file path', () => {
            const inputs = _testValues.allButString('');
            const error = 'Invalid filePath (arg #1)';

            inputs.forEach((endpoint) => {
                const wrapper = () => {
                    return new Manifest(endpoint);
                };

                expect(wrapper).to.throw(error);
            });
        });

        it('should expose expected properties and methods', () => {
            const manifest = new Manifest(_testValues.getString('filePath'));

            expect(manifest).to.be.an('object');
            expect(manifest.load).to.be.a('function');
            expect(manifest.installRecords).to.be.an('array');
            expect(manifest.uninstallRecords).to.be.an('array');
            expect(manifest.privateContainerRepos).to.be.an('array');
        });
    });

    describe('load()', () => {
        function _generateManifestData() {
            return {
                installRecords: new Array(10).fill(0).map((item, index) => ({
                    releaseName: _testValues.getString(`releaseName_${index}`),
                    installOptions: {
                        chartName: _testValues.getString(`chartName_${index}`),
                        namespace: _testValues.getString(`namespace_${index}`),
                        setOptions: new Array(5)
                            .fill(0)
                            .map((item2, index2) => ({
                                key: _testValues.getString(
                                    `set_${index}_${index2}`
                                ),
                                value: _testValues.getString(
                                    `set_${index}_${index2}`
                                )
                            }))
                    }
                })),
                uninstallRecords: new Array(10)
                    .fill(0)
                    .map((item, index) => `uninstall_${index}`),
                privateContainerRepos: new Array(10)
                    .fill(0)
                    .map((item, index) => ({
                        repoUri: `repoUri_${index}`,
                        targets: new Array(10)
                            .fill(0)
                            .map((target, targetIndex) => ({
                                serviceAccount: `serviceAccount_${index}`,
                                secretName: `secret_${index}`,
                                namespace: `targetRepo_${index}`
                            }))
                    }))
            };
        }

        it('should return a promise when invoked', () => {
            const manifest = _createManifest();
            const ret = manifest.load();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should load the manifest file from the file system', () => {
            const filePath = _testValues.getString('filePath');
            const readFileMethod = _fsMock.mocks.readFile;
            expect(readFileMethod.stub).to.not.have.been.called;

            const manifest = _createManifest(filePath);
            manifest.load();

            return _asyncHelper
                .wait(1)()
                .then(() => {
                    expect(readFileMethod.stub).to.have.been.calledOnce;
                    expect(readFileMethod.stub.args[0]).to.have.length(2);
                    expect(readFileMethod.stub.args[0][0]).to.equal(filePath);
                    expect(readFileMethod.stub.args[0][1]).to.be.a('function');
                });
        });

        it('should reject the promise if manifest load fails', () => {
            const readFileMethod = _fsMock.mocks.readFile;

            const manifest = _createManifest();
            const ret = manifest.load();

            const readFileCallback = readFileMethod.stub.args[0][1];
            readFileCallback('something went wrong');

            return expect(ret).to.be.rejectedWith(
                'Error reading manifest file'
            );
        });

        it('should reject the promise if the contents of the manifest is not valid JSON', () => {
            const readFileMethod = _fsMock.mocks.readFile;

            const manifest = _createManifest();
            const ret = manifest.load();

            const readFileCallback = readFileMethod.stub.args[0][1];
            readFileCallback(null, 'bad json');

            return expect(ret).to.be.rejectedWith(
                'Error parsing manifest file'
            );
        });

        it('should reject the promise if the manifest.privateContainerRepos is invalid', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButArray();

            return Promise.map(inputs, (privateContainerRepos) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos = privateContainerRepos;

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*privateContainerRepos.*/
                );
            });
        });

        it('should reject the promise if the manifest.privateContainerRepos has invalid values', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButObject();

            return Promise.map(inputs, (repo) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos = new Array(10)
                    .fill(0)
                    .map((item) => repo);

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*privateContainerRepos.*/
                );
            });
        });

        it('should reject the promise if the a privateRepo does not define a repoUri', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (repoUri) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos.forEach((record) => {
                    record.repoUri = repoUri;
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*repoUri.*/
                );
            });
        });

        it('should reject the promise if the a privateRepo does not define valid targets', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButArray([]);

            return Promise.map(inputs, (targets) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos.forEach((record) => {
                    record.targets = targets;
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*targets.*/
                );
            });
        });

        it('should reject the promise if the targets element is invalid', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButObject();

            return Promise.map(inputs, (target) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos.forEach((record) => {
                    record.targets = new Array(10)
                        .fill(0)
                        .map((item) => target);
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*target.*/
                );
            });
        });

        it('should reject the promise if the target does not define a serviceAccount', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (serviceAccount) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos.forEach((record) => {
                    record.targets.forEach((target) => {
                        target.serviceAccount = serviceAccount;
                    });
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*serviceAccount.*/
                );
            });
        });

        it('should reject the promise if the target does not define a namespace', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (namespace) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos.forEach((record) => {
                    record.targets.forEach((target) => {
                        target.namespace = namespace;
                    });
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*namespace.*/
                );
            });
        });

        it('should reject the promise if the target does not define a secretName', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (secretName) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.privateContainerRepos.forEach((record) => {
                    record.targets.forEach((target) => {
                        target.secretName = secretName;
                    });
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*secretName.*/
                );
            });
        });

        it('should reject the promise if the manifest.uninstallRecords is invalid', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButArray();

            return Promise.map(inputs, (uninstallRecords) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.uninstallRecords = uninstallRecords;

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*uninstallRecords.*/
                );
            });
        });

        it('should reject the promise if the manifest.uninstallRecords has invalid values', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (record) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.uninstallRecords = new Array(10)
                    .fill(0)
                    .map((item) => record);

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*uninstallRecords.*/
                );
            });
        });

        it('should reject the promise if the manifest.installRecords is invalid', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButArray();

            return Promise.map(inputs, (installRecords) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords = installRecords;

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*installRecords.*/
                );
            });
        });

        it('should reject the promise if the manifest.installRecords has invalid values', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButObject();

            return Promise.map(inputs, (record) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords = new Array(10)
                    .fill(0)
                    .map((item) => record);

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*installRecords.*/
                );
            });
        });

        it('should reject the promise if the an installRecord does not define a releaseName', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (releaseName) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.releaseName = releaseName;
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*releaseName.*/
                );
            });
        });

        it('should reject the promise if the an installRecord does not define installOptions', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (installOptions) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.installOptions = installOptions;
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*installOptions.*/
                );
            });
        });

        it('should reject the promise if the the installOptions does not define a valid chartName', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (chartName) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.installOptions.chartName = chartName;
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*chartName.*/
                );
            });
        });

        it('should reject the promise if the an installRecord defines an invalid namespace', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (namespace) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.installOptions.namespace = namespace;
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*namespace.*/
                );
            });
        });

        it('should reject the promise if the the installOptions does not define a valid setOptions', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButArray();

            return Promise.map(inputs, (setOptions) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.installOptions.setOptions = setOptions;
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*setOptions.*/
                );
            });
        });

        it('should reject the promise if the the setOptions does not define a option', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButObject();

            return Promise.map(inputs, (option) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.installOptions.setOptions = new Array(10)
                        .fill(0)
                        .map((item) => option);
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*setOptions.*/
                );
            });
        });

        it('should reject the promise if the the setOptions does not define a valid key', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (key) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.installOptions.setOptions.forEach((option) => {
                        option.key = key;
                    });
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*key.*/
                );
            });
        });

        it('should reject the promise if the the setOptions does not define a valid value', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const inputs = _testValues.allButString('');

            return Promise.map(inputs, (value) => {
                const manifest = _createManifest();
                const manifestData = _generateManifestData();
                manifestData.installRecords.forEach((record) => {
                    record.installOptions.setOptions.forEach((option) => {
                        option.value = value;
                    });
                });

                readFileMethod.reset();
                const ret = manifest.load();

                const readFileCallback = readFileMethod.stub.args[0][1];
                readFileCallback(null, JSON.stringify(manifestData));

                return expect(ret).to.be.rejectedWith(
                    /.*Manifest does not conform to expected schema.*value.*/
                );
            });
        });

        it('should populate properties with values from the manifest if parsing succeeds', () => {
            const readFileMethod = _fsMock.mocks.readFile;
            const manifestData = _generateManifestData();

            const manifest = _createManifest();
            const ret = manifest.load();

            const readFileCallback = readFileMethod.stub.args[0][1];
            readFileCallback(null, JSON.stringify(manifestData));

            return expect(ret).to.be.fulfilled.then(() => {
                expect(manifest.installRecords).to.deep.equal(
                    manifestData.installRecords
                );
                expect(manifest.uninstallRecords).to.deep.equal(
                    manifestData.uninstallRecords
                );
                expect(manifest.privateContainerRepos).to.deep.equal(
                    manifestData.privateContainerRepos
                );
            });
        });
    });
});
