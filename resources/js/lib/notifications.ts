import { router } from '@inertiajs/react';
import { show as runShow } from '@/routes/runs';
import { show as settingsShow } from '@/routes/settings';

declare global {
    interface Window {
        Native?: {
            on: (
                event: string,
                callback: (payload: { reference?: string }) => void,
            ) => void;
        };
    }
}

let listening = false;

/** A clicked desktop notification opens the run or the page it was about. NativePHP offers no way to stop listening, so this runs once. */
export function listenForNotificationClicks() {
    if (listening || typeof window === 'undefined' || !window.Native) {
        return;
    }

    listening = true;

    window.Native.on(
        'Native\\Desktop\\Events\\Notifications\\NotificationClicked',
        ({ reference = '' }) => {
            if (reference.startsWith('run:')) {
                router.visit(runShow(Number(reference.slice(4))).url);
            } else if (reference === 'update') {
                router.visit(settingsShow().url);
            }
        },
    );
}
