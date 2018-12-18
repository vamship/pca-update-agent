import { argValidator as _argValidator } from '@vamship/arg-utils';
import _loggerProvider from '@vamship/logger';
import { Promise } from 'bluebird';
import _fetch from 'isomorphic-fetch';
import _url from 'url';
import { ILogger } from './types';

/**
 * Abstraction that allows the update agent to report status and log messages to
 * the callback endpoint.
 */
export default class Reporter {
    private _recordBuffer: Array<{
        kind: string;
        timestamp: number;
        message: string;
    }>;
    private _endpoint: string;
    private _logger: ILogger;

    /**
     * @param endpoint The http endpoint to which status and log messages will
     *        be posted.
     */
    constructor(endpoint: string) {
        const error = 'Invalid endpoint (arg #1)';
        _argValidator.checkString(endpoint, 1, error);
        const { protocol, hostname } = _url.parse(endpoint);
        _argValidator.checkNumber(
            ['http:', 'https:'].indexOf(protocol || ''),
            0,
            error
        );
        _argValidator.checkString(hostname, 1, error);

        this._endpoint = endpoint;
        this._recordBuffer = [];
        this._logger = _loggerProvider.getLogger('reporter');
        this._logger.trace('Reporter initialized', {
            endpoint: this._endpoint
        });
    }

    /**
     * Records a log message to be sent to the callback endpoint. The message
     * is not dispatched, but is stored in an internal buffer.
     *
     * @param message The log message to send.
     */
    public log(message: string) {
        _argValidator.checkString(message, 1, 'Invalid message (arg #1)');
        this._logger.trace('Log message recorded', { message });
        this._recordBuffer.push({
            kind: 'log',
            message,
            timestamp: Date.now()
        });
    }

    /**
     * Records a success message to be sent to the callback endpoint. The
     * message is not dispatched, but is stored in an internal buffer.
     *
     * @param message The log message to send.
     */
    public success(message: string) {
        _argValidator.checkString(message, 1, 'Invalid message (arg #1)');
        this._logger.trace('Success message recorded', { message });
        this._recordBuffer.push({
            kind: 'success',
            message,
            timestamp: Date.now()
        });
    }

    /**
     * Records a failure message to be sent to the callback endpoint. The
     * message is not dispatched, but is stored in an internal buffer.
     *
     * @param message The log message to send.
     */
    public fail(message: string) {
        _argValidator.checkString(message, 1, 'Invalid message (arg #1)');
        this._logger.trace('Fail message recorded', { message });
        this._recordBuffer.push({
            kind: 'fail',
            message,
            timestamp: Date.now()
        });
    }

    /**
     * Flush all buffered log, success and failure messages to the callback
     * endpoint.
     */
    public flush(): Promise {
        this._logger.trace('Flushing recorded messages');
        if (this._recordBuffer.length > 0) {
            const records = this._recordBuffer;
            this._recordBuffer = [];

            this._logger.trace('POSTing messages to callback endpoint', {
                recordBuffer: this._recordBuffer
            });
            return _fetch(this._endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify(records)
            })
                .then(() => {
                    this._logger.trace('Messages POSTed to callback endpoint');
                })
                .catch((err) => {
                    this._logger.error(err, 'POST to callback endpoint failed');
                    this._recordBuffer = records.concat(this._recordBuffer);
                    throw err;
                });
        } else {
            this._logger.trace('No messages to flush');
            return Promise.resolve();
        }
    }
}
