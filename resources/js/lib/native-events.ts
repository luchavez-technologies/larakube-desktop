/**
 * Server-pushed events from NativePHP (docs/decisions/0021-push-data-changes-to-the-ui.md).
 *
 * `window.Native.on()` has no way to stop listening, so each event name is
 * registered with NativePHP once, here, and re-dispatched as a window
 * CustomEvent that pages can subscribe to and unsubscribe from normally.
 * Outside the app (a plain browser in development) there is no `window.Native`
 * and subscribing is a harmless no-op; pages keep their polling fallback.
 */

import { router } from '@inertiajs/react';
import { useEffect, useRef } from 'react';

declare global {
    interface Window {
        Native?: {
            on: (
                event: string,
                callback: (payload: Record<string, unknown>) => void,
            ) => void;
        };
    }
}

const registered = new Set<string>();

function normalize(event: string): string {
    return event.replace(/^\\+/, '');
}

function register(name: string): void {
    if (registered.has(name) || typeof window === 'undefined') {
        return;
    }

    const attach = () => {
        if (!window.Native || registered.has(name)) {
            return;
        }

        registered.add(name);
        window.Native.on(name, (payload) => {
            window.dispatchEvent(
                new CustomEvent(`native:${name}`, { detail: payload }),
            );
        });
    };

    if (window.Native) {
        attach();
    } else {
        window.addEventListener('native:init', attach, { once: true });
    }
}

/** Subscribe to a NativePHP-forwarded event; returns the unsubscribe function. */
export function onNativeEvent<T = Record<string, unknown>>(
    event: string,
    callback: (payload: T) => void,
): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }

    const name = normalize(event);
    const handler = (e: Event) => callback((e as CustomEvent<T>).detail);

    window.addEventListener(`native:${name}`, handler);
    register(name);

    return () => window.removeEventListener(`native:${name}`, handler);
}

/** Laravel event class names the UI listens for. */
export const NativeEvents = {
    serverDataSynced: 'App\\Events\\ServerDataSynced',
    runStarted: 'App\\Events\\RunStarted',
    runFinished: 'App\\Events\\RunFinished',
    localWorkloadsSynced: 'App\\Events\\LocalWorkloadsSynced',
    serversSynced: 'App\\Events\\ServersSynced',
    notificationCreated: 'App\\Events\\NotificationCreated',
} as const;

/** The slice of a server's data a ServerDataSynced names (App\\Enums\\ServerDataScope). */
export type ServerDataScope =
    | 'tools'
    | 'mail'
    | 'drive'
    | 'openbao'
    | 'sso'
    | 'plex'
    | 'backups'
    | 'domains'
    | 'external-dns'
    | 'tls'
    | 'cluster-users';

export type ServerDataSyncedPayload = {
    server: string;
    scope: ServerDataScope;
};

export type RunEventPayload = {
    run: number;
    kind: string | null;
    status: string;
    server: string | null;
    project: number | null;
};

/**
 * Reload props the moment a server's synced data changes. `props` maps each
 * scope this page shows to the props that scope feeds; other scopes are ignored.
 */
export function useServerDataReload(
    server: string | null | undefined,
    props: Partial<Record<ServerDataScope, string[]>>,
): void {
    const key = JSON.stringify(props);

    useEffect(() => {
        if (!server) {
            return;
        }

        const byScope = JSON.parse(key) as Partial<
            Record<ServerDataScope, string[]>
        >;

        return onNativeEvent<ServerDataSyncedPayload>(
            NativeEvents.serverDataSynced,
            (payload) => {
                const only = byScope[payload.scope];

                if (payload.server === server && only && only.length > 0) {
                    router.reload({ only });
                }
            },
        );
    }, [server, key]);
}

/**
 * Reload props when a run starts or finishes, optionally only for runs that
 * `matches` accepts (e.g. this page's project).
 */
export function useRunReload(
    only: string[],
    matches?: (payload: RunEventPayload) => boolean,
): void {
    const key = only.join(',');
    const matchesRef = useRef(matches);

    useEffect(() => {
        matchesRef.current = matches;
    });

    useEffect(() => {
        const handler = (payload: RunEventPayload) => {
            if (!matchesRef.current || matchesRef.current(payload)) {
                router.reload({ only: key.split(',') });
            }
        };

        const offStarted = onNativeEvent(NativeEvents.runStarted, handler);
        const offFinished = onNativeEvent(NativeEvents.runFinished, handler);

        return () => {
            offStarted();
            offFinished();
        };
    }, [key]);
}

/** Reload the given Inertia props whenever `event` arrives from NativePHP. */
export function useNativeEventReload(event: string, only: string[]): void {
    const key = only.join(',');

    useEffect(() => {
        return onNativeEvent(event, () => {
            router.reload({ only: key.split(',') });
        });
    }, [event, key]);
}
