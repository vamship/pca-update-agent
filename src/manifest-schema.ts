/**
 * The schema object for manifests.
 */
export default {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    description: 'Schema for pca-update manifest',
    required: ['containerRepositories', 'installRecords', 'uninstallRecords'],
    properties: {
        containerRepositories: {
            type: 'array',
            items: {
                type: 'string',
                minLength: 1,
                pattern: '^(.+)$'
            }
        },
        uninstallRecords: {
            type: 'array',
            items: {
                type: 'string',
                minLength: 1,
                pattern: '^(.+)$'
            }
        },
        installRecords: {
            type: 'array',
            items: {
                type: 'object',
                required: ['releaseName', 'installOptions'],
                properties: {
                    releaseName: {
                        type: 'string',
                        minLength: 1,
                        pattern: '^(.+)$'
                    },
                    installOptions: {
                        type: 'object',
                        required: ['chartName', 'setOptions'],
                        properties: {
                            chartName: {
                                type: 'string',
                                minLength: 1,
                                pattern: '^(.+)$'
                            },
                            namespace: {
                                type: 'string',
                                minLength: 1,
                                pattern: '^(.+)$'
                            },
                            setOptions: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    required: ['key', 'value'],
                                    properties: {
                                        key: {
                                            type: 'string',
                                            minLength: 1,
                                            pattern: '^(.+)$'
                                        },
                                        value: {
                                            type: 'string',
                                            minLength: 1,
                                            pattern: '^(.+)$'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};
