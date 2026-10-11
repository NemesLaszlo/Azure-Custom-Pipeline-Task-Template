import path = require('path');
import assert = require('assert');
import ttm = require('azure-pipelines-task-lib/mock-test');

/*
 * Each test runs one of the scripts next to this file in a separate Node
 * process through MockTestRunner and then inspects what the task reported.
 *
 * MockTestRunner picks the Node version from the highest handler in task.json
 * (Node 24 here) and downloads that runtime on the first run, so the first
 * execution needs network access and takes a little longer.
 *
 * Set TASK_TEST_TRACE=1 to see the full task output while the tests run
 * (`npm run test:trace`).
 */

async function runScript(scriptName: string): Promise<ttm.MockTestRunner> {
    const runner = new ttm.MockTestRunner(path.join(__dirname, `${scriptName}.js`));
    await runner.runAsync();
    return runner;
}

describe('Custom task template', function () {
    this.timeout(120_000);

    it('creates a new version when it does not exist yet', async () => {
        const tr = await runScript('success');

        assert.strictEqual(tr.succeeded, true, `task should succeed\n${tr.stdout}`);
        assert.strictEqual(tr.errorIssues.length, 0, 'should have no errors');
        assert.strictEqual(tr.warningIssues.length, 0, 'should have no warnings');
        assert.ok(tr.stdOutContained('[fake] uploaded installer.zip'), 'should upload the primary file');
        assert.ok(tr.stdOutContained('[fake] uploaded docs.zip'), 'should upload the secondary file');
        assert.ok(tr.stdOutContained("Version '1.2.3' created"), 'should report the created version');
        assert.ok(tr.stdOutContained('variable=createdVersionId;isOutput=true'), 'should set the output variable');
        assert.ok(tr.stdOutContained('##vso[task.setsecret]secret-token'), 'should mask the token');
    });

    it('skips with a warning when the version exists and onExisting=skip', async () => {
        const tr = await runScript('skip-existing');

        assert.strictEqual(tr.succeeded, true, `task should succeed\n${tr.stdout}`);
        assert.strictEqual(tr.warningIssues.length, 1, 'should raise exactly one warning');
        assert.ok(tr.warningIssues[0].includes('already exists'), 'warning should mention the existing version');
        assert.ok(!tr.stdOutContained('[fake] uploaded'), 'should not upload anything');
    });

    it('updates the version when it exists and onExisting=update', async () => {
        const tr = await runScript('update-existing');

        assert.strictEqual(tr.succeeded, true, `task should succeed\n${tr.stdout}`);
        assert.ok(tr.stdOutContained('[fake] uploaded installer.zip'), 'should upload the primary file');
        assert.ok(tr.stdOutContained("Version '1.2.3' updated"), 'should report the updated version');
    });

    it('fails when the version exists and onExisting=fail', async () => {
        const tr = await runScript('fail-existing');

        assert.strictEqual(tr.succeeded, false, 'task should fail');
        assert.strictEqual(tr.errorIssues.length, 1, 'should raise exactly one error');
        assert.ok(tr.errorIssues[0].includes("Version '1.2.3' already exists"), tr.errorIssues[0]);
        assert.ok(!tr.stdOutContained('[fake] uploaded'), 'should not upload anything');
    });

    it('fails when a required input is missing', async () => {
        const tr = await runScript('fail-missing-token');

        assert.strictEqual(tr.succeeded, false, 'task should fail');
        assert.ok(tr.createdErrorIssue('Input required: apiToken'), `unexpected errors: ${tr.errorIssues.join(' | ')}`);
    });

    it('fails with a clear message on an invalid chunk size', async () => {
        const tr = await runScript('fail-bad-chunk-size');

        assert.strictEqual(tr.succeeded, false, 'task should fail');
        assert.ok(tr.errorIssues[0].includes("Input 'chunkSizeMb' must be a positive integer"), tr.errorIssues[0]);
    });
});
