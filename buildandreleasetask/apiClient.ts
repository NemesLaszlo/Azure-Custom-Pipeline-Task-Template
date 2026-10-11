import tl = require('azure-pipelines-task-lib/task');

/**
 * Thrown when the API answers with a non-2xx status. Carries the status code and
 * response body so callers (and the task log) can show something useful.
 */
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly method: string,
        public readonly url: string,
        public readonly body: string,
    ) {
        super(`${method} ${url} failed with HTTP ${status}${body ? `: ${truncate(body, 500)}` : ''}`);
        this.name = 'ApiError';
    }
}

export interface ApiClientOptions {
    /** Base URL of the API, e.g. https://my-service.example.com */
    baseUrl: string;
    /** Bearer token sent in the Authorization header. */
    token: string;
    /** Per-request timeout. Defaults to 2 minutes. */
    timeoutMs?: number;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RequestBody = NonNullable<RequestInit['body']>;

/**
 * Minimal JSON/binary HTTP client built on the global `fetch` that ships with
 * Node 20 and Node 24. No extra dependency (such as node-fetch) is needed.
 *
 * Keep this class free of task-specific knowledge: it should only know how to
 * talk HTTP, not what the endpoints mean.
 */
export class ApiClient {
    private readonly baseUrl: string;
    private readonly token: string;
    private readonly timeoutMs: number;

    constructor(options: ApiClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.token = options.token;
        this.timeoutMs = options.timeoutMs ?? 120_000;
    }

    get<T>(path: string): Promise<T> {
        return this.sendJson<T>('GET', path);
    }

    post<T>(path: string, body?: unknown): Promise<T> {
        return this.sendJson<T>('POST', path, body);
    }

    put<T>(path: string, body?: unknown): Promise<T> {
        return this.sendJson<T>('PUT', path, body);
    }

    /** Sends raw bytes (for example one chunk of a file) as application/octet-stream. */
    async sendBinary(path: string, data: Uint8Array, method: HttpMethod = 'POST'): Promise<void> {
        await this.send(method, path, { 'Content-Type': 'application/octet-stream' }, data);
    }

    private async sendJson<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
        const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
        const response = await this.send(method, path, headers, body === undefined ? undefined : JSON.stringify(body));

        const text = await response.text();
        if (!text) {
            return undefined as T;
        }
        try {
            return JSON.parse(text) as T;
        } catch {
            throw new Error(`${method} ${response.url} returned a non-JSON response: ${truncate(text, 200)}`);
        }
    }

    private async send(method: HttpMethod, path: string, headers: Record<string, string>, body?: RequestBody): Promise<Response> {
        const url = `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
        tl.debug(`HTTP ${method} ${url}`);

        let response: Response;
        try {
            response = await fetch(url, {
                method,
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${this.token}`,
                    ...headers,
                },
                body,
                redirect: 'follow',
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (err) {
            // Network-level failure: DNS, connection refused, timeout, TLS, ...
            throw new Error(`${method} ${url} failed: ${describeError(err)}`, { cause: err });
        }

        if (!response.ok) {
            const responseBody = await response.text().catch(() => '');
            throw new ApiError(response.status, method, url, responseBody);
        }

        tl.debug(`HTTP ${method} ${url} -> ${response.status}`);
        return response;
    }
}

function describeError(err: unknown): string {
    if (err instanceof Error) {
        const cause = (err as Error & { cause?: unknown }).cause;
        return cause instanceof Error ? `${err.message} (${cause.message})` : err.message;
    }
    return String(err);
}

function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
