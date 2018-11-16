import {
    argValidator as _argValidator,
    schemaHelper as _schemaHelper
} from '@vamship/arg-utils';
import _loggerProvider from '@vamship/logger';
import { Promise } from 'bluebird';
import _fs from 'fs';
import manifestSchema from './manifest-schema';
import {
    IInstallRecord,
    ILogger,
    IPrivateContainerRepoRecord
} from './types';

const _checkManifestSchema = _schemaHelper.createSchemaChecker(
    manifestSchema,
    'Manifest does not conform to expected schema'
);

/**
 * Represents a manifest file that defines the software components to be
 * installed on the cluster.
 */
export default class Manifest {
    private _installRecords: IInstallRecord[];
    private _uninstallRecords: string[];
    private _privateContainerRepos: IPrivateContainerRepoRecord[];
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
        this._privateContainerRepos = [];
        this._logger = _loggerProvider.getLogger('manifest');
        this._logger.trace('Manifest initialized', {
            filePath: this._filePath
        });
    }

    /**
     * A list of components to be installed on the cluster.
     */
    public get installRecords(): IInstallRecord[] {
        return this._installRecords;
    }

    /**
     * A list of components to be uninstalled from the cluster.
     */
    public get uninstallRecords(): string[] {
        return this._uninstallRecords;
    }

    /**
     * A list of private container repos that require credentials for access.
     */
    public get privateContainerRepos(): IPrivateContainerRepoRecord[] {
        return this._privateContainerRepos;
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

                try {
                    this._logger.trace('Manifest data', { manifestData });
                    _checkManifestSchema(manifestData, true);
                } catch (ex) {
                    this._logger.error(ex, 'Manifest file validation failed');
                    throw ex;
                }

                this._installRecords = manifestData.installRecords;
                this._uninstallRecords = manifestData.uninstallRecords;
                this._privateContainerRepos =
                    manifestData.privateContainerRepos;
            },
            (err) => {
                this._logger.error(err, 'Error reading manifest file');
                throw new Error('Error reading manifest file');
            }
        );
    }
}
