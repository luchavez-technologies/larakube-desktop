/**
 * Server-pushed events from NativePHP (docs/decisions/0021-push-data-changes-to-the-ui.md).
 *
 * `window.Native.on()` has no way to stop listening, so each event name is
 * registered with NativePHP once, here, and re-dispatched as a window
 * CustomEvent that pages can subscribe to and unsubscribe from normally.
 * Outside the app (a plain browser in development) there is no `window.Native`
 * and subscribing is a harmless no-op; pages keep their polling fallback.
 */

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
    clusterToolsSynced: 'App\\Events\\ClusterToolsSynced',
} as const;
