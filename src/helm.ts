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
     * @param chartInfo The chart to install along with the required install
     *        options.
     * @param dryRun If set to true, the uninstall operation is not actually
     *        performed. The command is executed in dry run mode instead.
     */
    public install(chartInfo: IChartInfo, dryRun: boolean = false) {
        _argValidator.checkObject(chartInfo, 'Invalid chartInfo (arg #1)');
        _argValidator.checkString(
            chartInfo.chartName,
            1,
            'Invalid chartName (chartInfo.chartName)'
        );

        _argValidator.checkString(
            chartInfo.namespace,
            1,
            'Invalid namespace (chartInfo.namespace)'
        );

        _argValidator.checkArray(
            chartInfo.setOptions,
            'Invalid setOptions (chartInfo.setOptions)'
        );

        const args = [
            'upgrade',
            this._releaseName,
            chartInfo.chartName,
            '--install',
            '--debug',
            '--tls'
        ];
        if (chartInfo.namespace) {
            args.push(`--namespace=${chartInfo.namespace}`);
        }
        if (chartInfo.setOptions.length > 0) {
            const setArgs = chartInfo.setOptions
                .map(({ key, value }) => `${key}=${value}`)
                .join(',');
            args.push(`--set=${setArgs}`);
        }
        if (dryRun) {
            args.push('--dry-run');
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
     * @param dryRun If set to true, the uninstall operation is not actually
     *        performed. The command is executed in dry run mode instead.
     */
    public uninstall(purge: boolean = true, dryRun: boolean = false) {
        const args = ['delete', this._releaseName, '--tls'];
        if (!!purge) {
            args.push('--purge');
        }
        if (dryRun) {
            args.push('--dry-run');
        }

        this._logger.trace('Deleting helm release', {
            purge
        });

        return _execa('helm', args);
    }
}
