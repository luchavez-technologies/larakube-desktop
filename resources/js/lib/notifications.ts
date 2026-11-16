import { router } from '@inertiajs/react';
import { show as runShow } from '@/routes/runs';
import { show as settingsShow } from '@/routes/settings';

// window.Native is typed in ./native-events.
import './native-events';

let listening = false;

/** A clicked desktop notification opens the run or the page it was about. NativePHP offers no way to stop listening, so this runs once. */
export function listenForNotificationClicks() {
    if (listening || typeof window === 'undefined' || !window.Native) {
        return;
    }

    listening = true;

    window.Native.on(
        'Native\\Desktop\\Events\\Notifications\\NotificationClicked',
        (payload) => {
            const reference =
                typeof payload.reference === 'string' ? payload.reference : '';
            if (reference.startsWith('run:')) {
                router.visit(runShow(Number(reference.slice(4))).url);
            } else if (reference === 'update') {
                router.visit(settingsShow().url);
            }
        },
    );
}
