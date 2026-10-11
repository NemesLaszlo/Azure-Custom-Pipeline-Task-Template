import tl = require('azure-pipelines-task-lib/task');
import path = require('path');

/**
 * All inputs the task accepts, already validated and converted to the right types.
 * Reading inputs in one place keeps `index.ts` focused on the actual work and
 * makes it obvious what the task needs when you add or remove an input.
 */
export interface TaskInputs {
    apiUrl: string;
    apiToken: string;
    resourceId: string;
    versionString: string;
    onExisting: OnExistingBehaviour;
    markActive: boolean;
    primaryFilePath: string;
    secondaryFilePath?: string;
    publishDate: string;
    changelog: string[];
    chunkSizeBytes: number;
    workingDirectory: string;
}

export type OnExistingBehaviour = 'fail' | 'skip' | 'update';

const ON_EXISTING_VALUES: readonly OnExistingBehaviour[] = ['fail', 'skip', 'update'];

/**
 * Reads and validates every input declared in `task.json`.
 * Throws an `Error` with a user-friendly message when something is wrong, so the
 * caller can simply report it with `tl.setResult(Failed, err.message)`.
 */
export function readInputs(): TaskInputs {
    // Secrets: mask the token as early as possible so it never shows up in logs,
    // even if some later log line accidentally prints it.
    const apiToken = tl.getInputRequired('apiToken');
    tl.setSecret(apiToken);

    const apiUrl = tl.getInputRequired('apiUrl').trim();
    if (!/^https?:\/\//i.test(apiUrl)) {
        throw new Error(`Input 'apiUrl' must start with http:// or https://, got '${apiUrl}'.`);
    }

    const workingDirectory =
        tl.getPathInput('workingDirectory', false) ||
        tl.getVariable('System.DefaultWorkingDirectory') ||
        process.cwd();

    const onExisting = tl.getInputRequired('onExisting') as OnExistingBehaviour;
    if (!ON_EXISTING_VALUES.includes(onExisting)) {
        throw new Error(`Input 'onExisting' must be one of ${ON_EXISTING_VALUES.join(', ')}, got '${onExisting}'.`);
    }

    const chunkSizeMb = parsePositiveInteger(tl.getInputRequired('chunkSizeMb'), 'chunkSizeMb');

    const publishDate = tl.getInput('publishDate', false)?.trim() || todayIsoDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
        throw new Error(`Input 'publishDate' must use the yyyy-MM-dd format, got '${publishDate}'.`);
    }

    // multiLine inputs arrive as a single string; split into trimmed, non-empty lines.
    const changelog = tl.getDelimitedInput('changelog', /\r?\n/, false)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const secondaryFilePath = tl.getPathInput('secondaryFilePath', false)?.trim();

    return {
        apiUrl,
        apiToken,
        resourceId: tl.getInputRequired('resourceId').trim(),
        versionString: tl.getInputRequired('versionString').trim(),
        onExisting,
        markActive: tl.getBoolInput('markActive', false),
        primaryFilePath: resolvePath(tl.getPathInputRequired('primaryFilePath'), workingDirectory),
        secondaryFilePath: secondaryFilePath ? resolvePath(secondaryFilePath, workingDirectory) : undefined,
        publishDate,
        changelog,
        chunkSizeBytes: chunkSizeMb * 1024 * 1024,
        workingDirectory,
    };
}

function parsePositiveInteger(raw: string, inputName: string): number {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Input '${inputName}' must be a positive integer, got '${raw}'.`);
    }
    return value;
}

function resolvePath(p: string, baseDirectory: string): string {
    return path.isAbsolute(p) ? p : path.resolve(baseDirectory, p);
}

function todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
}
