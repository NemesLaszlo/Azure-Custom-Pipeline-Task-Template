import path = require('path');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import { configureRunner } from './fakes';

const runner = new tmrm.TaskMockRunner(path.join(__dirname, '..', 'index.js'));
// An empty value is the same as not setting the input at all.
configureRunner(runner, { apiToken: '' });
runner.run();
