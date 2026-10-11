import { useEffect, useRef } from 'react';
import { celebrate } from '@/lib/celebrate';

/**
 * Fires the confetti celebration the moment `succeeded` becomes true, once
 * per true->false->true cycle — so a page reused for a second run ("Create
 * another", a fresh Quick Launch) celebrates again instead of staying silent.
 */
export function useCelebrateOnSuccess(succeeded: boolean): void {
    const fired = useRef(false);

    useEffect(() => {
        if (succeeded && !fired.current) {
            fired.current = true;
            celebrate();
        } else if (!succeeded) {
            fired.current = false;
        }
    }, [succeeded]);
}
