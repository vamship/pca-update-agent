#!/usr/bin/env node
'use strict';

import _configProvider from '@vamship/config';
import _loggerProvider from '@vamship/logger';
import _yargs from 'yargs';

_configProvider
    .configure('pcaUpdateAgent', {})
    .setApplicationScope(process.env.NODE_ENV || 'development');

_loggerProvider.configure('pca-update-agent', {
    level: process.env.LOG_LEVEL || 'error',
    destination: 'process.stderr',
    extreme: false
});
const _logger = _loggerProvider.getLogger('main');

_logger.trace('Logger initialized');

const argv = _yargs
    .usage('Usage $0 <command> <sub commands> <options>')
    .commandDir('../commands')
    .demandCommand()
    .help()
    .wrap(_yargs.terminalWidth()).argv;

_logger.trace('Input arguments', argv);
