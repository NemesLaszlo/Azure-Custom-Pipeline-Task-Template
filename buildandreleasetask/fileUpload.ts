import fs = require('fs');
import path = require('path');
import { ApiClient } from './apiClient';

/** Shape of the response returned by the upload initialisation endpoint. */
export interface UploadInitResponse {
    fileId: string;
}

/**
 * Uploads a file in fixed-size chunks:
 *   1. GET  /api/file-upload/initialize            -> { fileId }
 *   2. POST /api/file-upload/{fileId}/append        (one call per chunk, raw bytes)
 *
 * Adjust the endpoints and the response shape to match your own API.
 * Returns the server-side file id so the caller can reference the upload.
 */
export async function uploadFileInChunks(client: ApiClient, filePath: string, chunkSizeBytes: number): Promise<string> {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
    }
    if (stats.size === 0) {
        throw new Error(`File is empty: ${filePath}`);
    }

    const chunkCount = Math.ceil(stats.size / chunkSizeBytes);
    console.log(`Uploading ${path.basename(filePath)} (${formatBytes(stats.size)}) in ${chunkCount} chunk(s)...`);

    const init = await client.get<UploadInitResponse>('/api/file-upload/initialize');
    if (!init?.fileId) {
        throw new Error('Upload initialisation did not return a file id.');
    }

    const handle = await fs.promises.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(Math.min(chunkSizeBytes, stats.size));
        for (let index = 0; index < chunkCount; index++) {
            const position = index * chunkSizeBytes;
            const length = Math.min(chunkSizeBytes, stats.size - position);
            const { bytesRead } = await handle.read(buffer, 0, length, position);
            if (bytesRead !== length) {
                throw new Error(`Short read while uploading ${filePath}: expected ${length} bytes, got ${bytesRead}.`);
            }

            console.log(`  chunk ${index + 1}/${chunkCount} (${formatBytes(length)})`);
            await client.sendBinary(`/api/file-upload/${encodeURIComponent(init.fileId)}/append`, buffer.subarray(0, bytesRead));
        }
    } finally {
        await handle.close();
    }

    console.log(`Upload complete: ${path.basename(filePath)} -> file id ${init.fileId}`);
    return init.fileId;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
