/*
 * Fake implementations of the modules `index.ts` depends on. Each test script
 * registers these with `TaskMockRunner.registerMock(...)` so the task runs
 * without touching the network or the file system.
 *
 * The module names passed to registerMock must match the require() strings in
 * index.ts exactly ('./apiClient', './fileUpload').
 */
import path = require('path');

export interface FakeVersion {
    versionId: string;
    versionString: string;
    isActive: boolean;
}

export interface FakeApiState {
    versions: FakeVersion[];
    created?: unknown;
    updated?: unknown;
}

export function createFakeApiClientModule(state: FakeApiState) {
    class ApiError extends Error {
        constructor(public readonly status: number, public readonly body: string) {
            super(`HTTP ${status}: ${body}`);
        }
    }

    class ApiClient {
        constructor(_options: unknown) {}

        async get(apiPath: string): Promise<unknown> {
            if (/^\/api\/products\/[^/]+$/.test(apiPath)) {
                return { id: 'demo', versions: state.versions };
            }
            throw new ApiError(404, `unexpected GET ${apiPath}`);
        }

        async post(apiPath: string, body: { versionString: string }): Promise<unknown> {
            if (apiPath.endsWith('/versions/create')) {
                state.created = body;
                return { versionId: 'v-new', versionString: body.versionString, isActive: false };
            }
            throw new ApiError(404, `unexpected POST ${apiPath}`);
        }

        async put(apiPath: string, body: { versionString: string }): Promise<unknown> {
            if (apiPath.endsWith('/edit')) {
                state.updated = body;
                return { versionId: 'v-existing', versionString: body.versionString, isActive: false };
            }
            throw new ApiError(404, `unexpected PUT ${apiPath}`);
        }

        async sendBinary(): Promise<void> {}
    }

    return { ApiClient, ApiError };
}

export function createFakeFileUploadModule() {
    return {
        uploadFileInChunks: async (_client: unknown, filePath: string): Promise<string> => {
            console.log(`[fake] uploaded ${path.basename(filePath)}`);
            return `file-${path.basename(filePath)}`;
        },
    };
}

/** Inputs that make the task succeed; individual tests override what they need. */
export const validInputs: Record<string, string> = {
    apiUrl: 'https://example.com',
    apiToken: 'secret-token',
    resourceId: 'demo',
    versionString: '1.2.3',
    onExisting: 'fail',
    markActive: 'true',
    primaryFilePath: 'installer.zip',
    secondaryFilePath: '',
    publishDate: '2026-01-15',
    changelog: 'First line\r\n\r\nSecond line\n',
    chunkSizeMb: '10',
    workingDirectory: '',
};

/** Shared setup used by every test script: applies the inputs and registers the fakes. */
export function configureRunner(
    runner: { setInput(name: string, value: string): void; registerMock(name: string, mod: unknown): void },
    overrides: Record<string, string> = {},
    state: FakeApiState = { versions: [] },
): void {
    for (const [name, value] of Object.entries({ ...validInputs, ...overrides })) {
        if (value !== undefined) {
            runner.setInput(name, value);
        }
    }
    runner.registerMock('./apiClient', createFakeApiClientModule(state));
    runner.registerMock('./fileUpload', createFakeFileUploadModule());
}

export const existingVersion: FakeVersion = { versionId: 'v-existing', versionString: '1.2.3', isActive: true };
