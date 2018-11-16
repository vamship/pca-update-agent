import { argValidator as _argValidator } from '@vamship/arg-utils';
import _loggerProvider from '@vamship/logger';
import _execa from 'execa';
import { IChartInfo, ILogger } from './types';

/**
 * Wrapper class that can execute helm commands and return a success/failure
 * message based on the result of execution.
 */
export default class Helm {
    private _releaseName: string;
    private _logger: ILogger;

    /**
     * @param releaseName Name of the release associated with a specific
     *        installation.
     */
    constructor(releaseName: string) {
        _argValidator.checkString(
            releaseName,
            1,
            'Invalid releaseName (arg #1)'
        );

        this._releaseName = releaseName;
        this._logger = _loggerProvider.getLogger('helm', { releaseName });
        this._logger.trace('Helm object initialized');
    }

    /**
     * Install or upgrade a helm chart with the specified options.
     *
     * @param chartName The name of the chart.
     * @param installOptions Options to be included with the installation
     *        commands.
     */
    public install(installOptions: IChartInfo) {
        _argValidator.checkObject(
            installOptions,
            'Invalid installOptions (arg #1)'
        );
        _argValidator.checkString(
            installOptions.chartName,
            1,
            'Invalid chartName (installOptions.chartName)'
        );

        _argValidator.checkString(
            installOptions.namespace,
            1,
            'Invalid namespace (installOptions.namespace)'
        );

        _argValidator.checkArray(
            installOptions.setOptions,
            'Invalid setOptions (installOptions.setOptions)'
        );

        const args = [
            'upgrade',
            this._releaseName,
            installOptions.chartName,
            '--install',
            '--debug',
            '--tls'
        ];
        if (installOptions.namespace) {
            args.push(`--namespace=${installOptions.namespace}`);
        }
        if (installOptions.setOptions.length > 0) {
            const setArgs = installOptions.setOptions
                .map(({ key, value }) => `${key}=${value}`)
                .join(',');
            args.push(`--set=${setArgs}`);
        }

        this._logger.trace('Installing helm chart', {
            args
        });

        return _execa('helm', args);
    }

    /**
     * Deletes a chart that has already been installed.
     *
     * @param purge If set to true, purges the release name, making it available
     *        for reuse.
     */
    public uninstall(purge: boolean = true) {
        const args = ['delete', this._releaseName, '--tls'];
        if (!!purge) {
            args.push('--purge');
        }

        this._logger.trace('Deleting helm release', {
            purge
        });

        return _execa('helm', args);
    }
}
