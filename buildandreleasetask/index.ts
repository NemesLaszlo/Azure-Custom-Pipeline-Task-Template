import tl = require('azure-pipelines-task-lib/task');
import { readInputs } from './inputs';
import { ApiClient, ApiError } from './apiClient';
import { uploadFileInChunks } from './fileUpload';

/*
 * Entry point of the task. The agent runs `node index.js` with every input
 * exposed as an INPUT_<NAME> environment variable; `azure-pipelines-task-lib`
 * reads them for us.
 *
 * The example flow mirrors a typical "publish a release to an internal service"
 * task:
 *   1. read + validate inputs
 *   2. look the parent resource up and check whether the version already exists
 *   3. upload one or two files in chunks
 *   4. create (or update) the version record
 *   5. expose the resulting id as an output variable
 *
 * Replace the API shapes and the flow with whatever your task has to do, but
 * keep the structure: inputs -> work -> setResult.
 */

interface Resource {
    id: string;
    versions: ResourceVersion[];
}

interface ResourceVersion {
    versionId: string;
    versionString: string;
    isActive: boolean;
}

interface VersionPayload {
    versionString: string;
    isActive: boolean;
    primaryFileId: string;
    secondaryFileId?: string;
    datePublished: string;
    changelogEntries: string[];
}

async function run(): Promise<void> {
    const inputs = readInputs();
    const client = new ApiClient({ baseUrl: inputs.apiUrl, token: inputs.apiToken });

    console.log(`Looking up resource '${inputs.resourceId}'...`);
    const resource = await client.get<Resource>(`/api/products/${encodeURIComponent(inputs.resourceId)}`);

    const existing = resource.versions.find(
        v => v.versionString.toUpperCase() === inputs.versionString.toUpperCase(),
    );

    if (existing) {
        switch (inputs.onExisting) {
            case 'fail':
                throw new Error(`Version '${inputs.versionString}' already exists for resource '${inputs.resourceId}'.`);
            case 'skip':
                tl.warning(`Version '${inputs.versionString}' already exists. Skipping.`);
                tl.setVariable('createdVersionId', existing.versionId, false, true);
                tl.setResult(tl.TaskResult.Succeeded, `Version '${inputs.versionString}' already exists; nothing to do.`);
                return;
            case 'update':
                console.log(`Version '${inputs.versionString}' already exists and will be updated.`);
                break;
        }
    }

    const primaryFileId = await uploadFileInChunks(client, inputs.primaryFilePath, inputs.chunkSizeBytes);
    const secondaryFileId = inputs.secondaryFilePath
        ? await uploadFileInChunks(client, inputs.secondaryFilePath, inputs.chunkSizeBytes)
        : undefined;

    const payload: VersionPayload = {
        versionString: inputs.versionString,
        isActive: inputs.markActive,
        primaryFileId,
        secondaryFileId,
        datePublished: inputs.publishDate,
        changelogEntries: inputs.changelog,
    };

    const resourcePath = `/api/products/${encodeURIComponent(inputs.resourceId)}/versions`;
    const version = existing
        ? await client.put<ResourceVersion>(`${resourcePath}/${encodeURIComponent(existing.versionString)}/edit`, payload)
        : await client.post<ResourceVersion>(`${resourcePath}/create`, payload);

    // Output variables let later steps use the result: $(stepName.createdVersionId)
    tl.setVariable('createdVersionId', version.versionId, false, true);
    tl.setResult(tl.TaskResult.Succeeded, `Version '${version.versionString}' ${existing ? 'updated' : 'created'} (id ${version.versionId}).`);
}

run().catch((err: unknown) => {
    // Always throw `Error` objects (never plain strings) so this message is never undefined.
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ApiError && err.body) {
        tl.debug(`Response body: ${err.body}`);
    }
    tl.setResult(tl.TaskResult.Failed, message);
});
