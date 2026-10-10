import { useEffect, useSyncExternalStore } from 'react';

/**
 * Whether a right-anchored slide-over (Quick Launch, the Tools install
 * drawer, …) is currently open — so RunDrawer, fixed at bottom-right, can
 * move to bottom-left instead of sitting invisible behind one. RunDrawer's
 * z-index is deliberately below every drawer/modal (see its own comment) so
 * it never covers a drawer's footer buttons; without this, that same choice
 * hides it completely behind a drawer that is actively telling the person to
 * go look at it (Quick Launch's "watch progress in the Activity panel").
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): boolean {
    return openCount > 0;
}

/** Call from a right-anchored drawer/slide-over with its own open state. */
export function useRightDrawerOpen(open: boolean): void {
    useEffect(() => {
        if (!open) {
            return;
        }

        openCount += 1;
        emit();

        return () => {
            openCount -= 1;
            emit();
        };
    }, [open]);
}

/** Call from RunDrawer to know whether to move out of the way. */
export function useIsAnyRightDrawerOpen(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot);
}
