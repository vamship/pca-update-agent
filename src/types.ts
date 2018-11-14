/**
 * @module root
 */

/**
 * Defines a container credentials object.
 */
export interface IContainerCredentials {
    /**
     * The container repo server.
     */
    server: string;

    /**
     * The username to use when authenticating against the repo.
     */
    username: string;

    /**
     * The password to use when authenticating against the repo.
     */
    password: string;

    /**
     * The email address associated with the repository username.
     */
    email: string;
}

/**
 * Defines a record for private repositories accessed during the update
 * operation.
 */
export interface IPrivateContainerRepoRecord {
    /**
     * The uri of the container repository
     */
    repoUri: string;

    /**
     * A list of target service accounts that will be accessing the private
     * repository.
     */
    targets: IPrivateRepoTarget[];
}

/**
 * Defines a target that specifies the identity that will access the private
 * repositories
 */
export interface IPrivateRepoTarget {
    /**
     * The name of the service account that will access the private repository.
     */
    serviceAccount: string;

    /**
     * The name of the secret into which to write the credentials.
     */
    secretName: string;

    /**
     * The namespace in which the service account resides.
     */
    namespace?: string;
}

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
