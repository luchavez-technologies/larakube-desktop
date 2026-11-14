import { useCallback, useEffect, useState } from 'react';

export type ToolStatus = {
    installed: boolean;
    path: string | null;
    version: string | null;
    diagnostic?: string | null;
    wsl?: {
        installed: boolean;
        path: string | null;
        version: string | null;
        diagnostic?: string | null;
    };
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

export function toolIsHealthy(status: ToolStatus): boolean {
    return status.installed && (status.version !== null || !status.diagnostic);
}

/** A one-off fresh check, for a caller that needs to decide something (not render a row) — bypasses the `known` cache entirely. */
export function toolIsInstalled(slug: string): Promise<boolean> {
    return load(slug, true)
        .then(toolIsHealthy)
        .catch(() => false);
}

type Listener = (slug?: string) => void;
const listeners = new Set<Listener>();

/**
 * Drops a remembered result, for when something changed what its check would
 * find. Pass a slug to drop just that one tool — e.g. after installing it,
 * nothing about every OTHER row's status changed, so there's no reason for
 * the whole list to recheck itself each time one row finishes. Omit it to
 * drop everything (a Desktop update, a WSL change — something that could
 * plausibly affect any tool at once).
 */
export function forgetToolStatus(slug?: string) {
    if (slug) {
        known.delete(slug);
    } else {
        known.clear();
    }

    listeners.forEach((listener) => listener(slug));
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

    useEffect(() => {
        const onForget = (forgottenSlug?: string) => {
            if (forgottenSlug === undefined || forgottenSlug === slug) {
                check(true);
            }
        };

        listeners.add(onForget);

        return () => {
            listeners.delete(onForget);
        };
    }, [check]);

    return { status, checking };
}
