import { useEffect, useState } from 'react';
import StatusPill from '@/components/status-pill';

export type SyncStatus = 'fresh' | 'syncing' | 'stale' | 'error';

type Props = {
    status: SyncStatus;
    lastSyncedAt: string | null;
    error?: string | null;
    subject: string;
};

function minutesAgo(lastSyncedAt: string): number {
    return Math.floor((Date.now() - new Date(lastSyncedAt).getTime()) / 60_000);
}

/**
 * "This data might be stale, but we're syncing it in the background" — one
 * indicator, reused everywhere a page shows a database mirror of CLI state
 * instead of shelling out live.
 */
export default function SyncStatusBadge({
    status,
    lastSyncedAt,
    error,
    subject,
}: Props) {
    const [, forceTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => forceTick((n) => n + 1), 30_000);
        return () => clearInterval(id);
    }, []);

    if (status === 'error') {
        return (
            <span title={error ?? undefined}>
                <StatusPill tone="warn">
                    {lastSyncedAt
                        ? `Couldn't refresh ${subject} — showing the last known data`
                        : `Couldn't check ${subject}`}
                </StatusPill>
            </span>
        );
    }

    if (status === 'syncing' || lastSyncedAt === null) {
        return <StatusPill tone="busy">Syncing {subject}…</StatusPill>;
    }

    const minutes = minutesAgo(lastSyncedAt);
    const label =
        minutes < 1
            ? 'Just synced'
            : minutes === 1
              ? 'Synced 1 min ago'
              : `Synced ${minutes} min ago`;

    return (
        <StatusPill tone={status === 'stale' ? 'muted' : 'ok'}>
            {label}
        </StatusPill>
    );
}
