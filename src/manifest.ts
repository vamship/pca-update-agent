import {
    argValidator as _argValidator,
    schemaHelper as _schemaHelper
} from '@vamship/arg-utils';
import _loggerProvider from '@vamship/logger';
import { Promise } from 'bluebird';
import _fs from 'fs';
import manifestSchema from './manifest-schema';
import { IChartInstallRecord, ILogger } from './types';

const _checkManifestSchema = _schemaHelper.createSchemaChecker(
    manifestSchema,
    'Manifest does not conform to expected schema'
);

/**
 * Represents a manifest file that defines the software components to be
 * installed on the cluster.
 */
export default class Manifest {
    private _installRecords: IChartInstallRecord[];
    private _uninstallRecords: string[];
    private _containerRepositories: string[];
    private _filePath: string;
    private _logger: ILogger;

    /**
     * @param filePath The path to the manifest file.
     */
    constructor(filePath: string) {
        _argValidator.checkString(filePath, 1, 'Invalid filePath (arg #1)');

        this._filePath = filePath;
        this._installRecords = [];
        this._uninstallRecords = [];
        this._containerRepositories = [];
        this._logger = _loggerProvider.getLogger('manifest');
        this._logger.trace('Manifest initialized', {
            filePath: this._filePath
        });
    }

    /**
     * A list of components to be installed on the cluster.
     */
    public get installRecords(): IChartInstallRecord[] {
        return this._installRecords;
    }

    /**
     * A list of components to be uninstalled from the cluster.
     */
    public get uninstallRecords(): string[] {
        return this._uninstallRecords;
    }

    /**
     * A list of docker repositories accessed by the installation scripts.
     */
    public get containerRepositories(): string[] {
        return this._containerRepositories;
    }

    /**
     * Loads the manifest from the file system, and initializes internal
     * properties.
     */
    public load(): Promise {
        const readFileMethod = Promise.promisify(_fs.readFile.bind(_fs));
        this._logger.trace('Loading manifest file', {
            file: this._filePath
        });
        return readFileMethod(this._filePath).then(
            (data) => {
                let manifestData;
                try {
                    this._logger.trace('Parsing manifest file');
                    manifestData = JSON.parse(data);
                } catch (ex) {
                    this._logger.error(ex, 'Error parsing manifest file');
                    throw new Error('Error parsing manifest file');
                }

                this._logger.trace('Manifest data', { manifestData });
                _checkManifestSchema(manifestData, true);

                this._installRecords = manifestData.installRecords;
                this._uninstallRecords = manifestData.uninstallRecords;
                this._containerRepositories =
                    manifestData.containerRepositories;
            },
            (err) => {
                this._logger.error(err, 'Error reading manifest file');
                throw new Error('Error reading manifest file');
            }
        );
    }
}
