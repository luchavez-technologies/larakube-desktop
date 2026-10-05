import { useCallback, useEffect, useState } from 'react';

export type ToolStatus = {
    installed: boolean;
    path: string | null;
    version: string | null;
    diagnostic?: string | null;
};

const FRESH_FOR_MS = 15_000;

const known = new Map<string, { at: number; status: ToolStatus }>();
const inFlight = new Map<string, Promise<ToolStatus>>();

function load(slug: string, fresh: boolean): Promise<ToolStatus> {
    const pending = inFlight.get(slug);

    if (pending && !fresh) {
        return pending;
    }

    const request = fetch(
        `/setup/tools/${slug}/status${fresh ? '?fresh=1' : ''}`,
        {
            headers: { Accept: 'application/json' },
        },
    )
        .then((response) => response.json() as Promise<ToolStatus>)
        .then((status) => {
            known.set(slug, { at: Date.now(), status });

            return status;
        })
        .finally(() => inFlight.delete(slug));

    inFlight.set(slug, request);

    return request;
}

/** Drops every remembered result, for when something changed what the checks would find. */
export function forgetToolStatus() {
    known.clear();
}

/**
 * One tool's state, fetched on its own so each Setup row fills in as soon as
 * its check finishes. A result stays valid for a few seconds across page
 * visits, so switching options does not check the same tool again.
 * Raising `refresh` forces a new check.
 */
export function useToolStatus(slug: string, refresh = 0) {
    const cached = known.get(slug);
    const [status, setStatus] = useState<ToolStatus | null>(
        cached?.status ?? null,
    );
    const [checking, setChecking] = useState(false);

    const check = useCallback(
        (fresh: boolean) => {
            setChecking(true);
            load(slug, fresh)
                .then(setStatus)
                .catch(() => setStatus(null))
                .finally(() => setChecking(false));
        },
        [slug],
    );

    useEffect(() => {
        const entry = known.get(slug);

        if (refresh === 0 && entry && Date.now() - entry.at < FRESH_FOR_MS) {
            setStatus(entry.status);

            return;
        }

        check(refresh > 0);
    }, [slug, refresh, check]);

    return { status, checking };
}
