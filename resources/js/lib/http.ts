function xsrf(): string {
    return decodeURIComponent(
        document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '',
    );
}

/** A JSON request to this app, with the CSRF token it needs. Resolves with the status too, so a caller can show a 422's message. */
export async function sendJson<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, string>,
): Promise<{ ok: boolean; data: T & { message?: string } }> {
    const init: RequestInit = {
        method,
        headers: {
            Accept: 'application/json',
            'X-XSRF-TOKEN': xsrf(),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
    };

    if (body) {
        init.body = JSON.stringify(body);
    }

    const response = await fetch(path, init);

    return {
        ok: response.ok,
        data: (await response.json().catch(() => ({}))) as T & {
            message?: string;
        },
    };
}
