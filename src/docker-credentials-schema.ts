/**
 * The schema object for manifests.
 */
export default {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    description: 'Schema for a docker credentials object',
    required: ['server', 'username', 'password', 'email'],
    properties: {
        server: {
            type: 'string',
            minLength: 1,
            pattern: '^(.+)$'
        },
        username: {
            type: 'string',
            minLength: 1,
            pattern: '^(.+)$'
        },
        password: {
            type: 'string',
            minLength: 1,
            pattern: '^(.+)$'
        },
        email: {
            type: 'string',
            format: 'email'
        }
    }
};
