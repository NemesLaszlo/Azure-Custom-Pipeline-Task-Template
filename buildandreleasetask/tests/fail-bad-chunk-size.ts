import path = require('path');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import { configureRunner } from './fakes';

const runner = new tmrm.TaskMockRunner(path.join(__dirname, '..', 'index.js'));
configureRunner(runner, { chunkSizeMb: 'ten' });
runner.run();
