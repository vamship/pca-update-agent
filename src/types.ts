/**
 * @module root
 */

/**
 * Defines the parameters required to install/upgrade a software component on
 * the cluster. The component must be defined as a helm chart.
 */
export interface IComponentInstallOptions {
    /**
     * The name of the chart.
     */
    chartName: string;

    /**
     * The namespace to install the chart into.
     */
    namespace?: string;

    /**
     * An array of set options to apply to the chart.
     */
    setOptions?: Array<{
        key: string;
        value: string;
    }>;
}

/**
 * Defines install specifications for a chart.
 */
export interface IChartInstallRecord {
    /**
     * The name of the release.
     */
    releaseName: string;

    /**
     * Installation options.
     */
    installOptions: IComponentInstallOptions;
}

/**
 * Interface for logger objects.
 */
export interface ILogger {
    /**
     * Trace logger method.
     */
    trace: (message: string, args?: {}) => void;

    /**
     * Debug logger method.
     */
    debug: (message: string, args?: {}) => void;

    /**
     * Info logger method.
     */
    info: (message: string, args?: {}) => void;

    /**
     * Warn logger method.
     */
    warn: (message: string, args?: {}) => void;

    /**
     * Error logger method.
     */
    error: (message: string, args?: {}) => void;

    /**
     * Fatal logger method.
     */
    fatal: (message: string, args?: {}) => void;
}
