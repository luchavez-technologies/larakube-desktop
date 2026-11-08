import { Form, Head, Link, router, usePoll } from '@inertiajs/react';
import { useEffect, useState, type ReactNode } from 'react';
import {
    AlertCircle,
    CalendarClock,
    CheckCircle2,
    DatabaseBackup,
    FolderOpen,
    HardDrive,
    History,
    KeyRound,
    Play,
    Plus,
    RotateCcw,
    RotateCw,
    ShieldAlert,
    ShieldCheck,
    Trash2,
    XCircle,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ExperimentalBadge from '@/components/experimental-badge';
import ProviderLogo from '@/components/provider-logo';
import ServerSwitcher from '@/components/server-switcher';
import StatusPill from '@/components/status-pill';
import SyncStatusBadge, {
    type SyncStatus,
} from '@/components/sync-status-badge';
import { SCHEDULES, ago, describeSchedule, formatBytes } from '@/lib/backups';
import type { BackupEntry, BackupStatus, Server } from '@/types/larakube';

type TabType = 'snapshots' | 'schedule' | 'destination' | 'recovery';

const TAB_STORAGE_KEY = 'larakube.backups.activeTab';

function readInitialTab(): TabType {
    if (typeof window === 'undefined') {
        return 'snapshots';
    }
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (
        stored === 'snapshots' ||
        stored === 'schedule' ||
        stored === 'destination' ||
        stored === 'recovery'
    ) {
        return stored;
    }
    return 'snapshots';
}

function cardKey(server: string): string {
    return `larakube.recovery-card-saved.${server}`;
}

function cardSaved(server: string): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    try {
        return window.localStorage.getItem(cardKey(server)) === '1';
    } catch {
        return false;
    }
}

type FleetServerBackup = {
    name: string;
    provider: string;
    region: string | null;
    configured: boolean;
    lastSyncedAt: string | null;
};

type Props = {
    server: Server;
    servers: Server[];
    isLocal: boolean;
    backup?: BackupStatus | null;
    backupSync: {
        status: SyncStatus;
        lastSyncedAt: string | null;
        error: string | null;
    };
    fleet: {
        total: number;
        protected: number;
        servers: FleetServerBackup[];
    };
};

type Dialog = 'setup' | 'schedule' | 'prune' | { restore: BackupEntry } | null;

const field =
    'w-full rounded-lg border-0 bg-paper px-3 py-2 text-[13px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand';

export default function BackupsIndex({
    server,
    servers,
    isLocal,
    backup,
    backupSync,
    fleet,
}: Props) {
    const [activeTab, setActiveTabState] = useState<TabType>(readInitialTab);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [saved, setSaved] = useState(() => cardSaved(server.name));

    useEffect(() => {
        setSaved(cardSaved(server.name));
    }, [server.name]);

    function setActiveTab(tab: TabType) {
        setActiveTabState(tab);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(TAB_STORAGE_KEY, tab);
        }
    }

    const isSyncing =
        !isLocal &&
        (backupSync.status === 'syncing' || backupSync.status === 'stale');

    const { start: startPoll, stop: stopPoll } = usePoll(
        2000,
        { only: ['backup', 'backupSync', 'fleet'] },
        { autoStart: isSyncing },
    );

    useEffect(() => {
        if (isSyncing) {
            startPoll();
        } else {
            stopPoll();
        }
    }, [isSyncing, startPoll, stopPoll]);

    const base = `/servers/${encodeURIComponent(server.name)}/backups`;

    function handleRefresh() {
        setRefreshing(true);
        router.post(
            `${base}/refresh`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setRefreshing(false),
            },
        );
    }

    const configured = backup?.configured === true;
    const schedule = backup?.schedule ?? null;
    const last = backup?.backups?.last ?? null;
    const entries = backup?.backups?.entries ?? [];
    const incomplete = backup?.backups?.incomplete ?? 0;
    const needsCard =
        configured && !saved && backup?.recoveryCard?.exists !== false;

    const tabs: Array<{
        id: TabType;
        label: string;
        icon: typeof History;
        badge?: number | string;
    }> = [
        {
            id: 'snapshots',
            label: 'Snapshots & Restore',
            icon: History,
            badge: entries.length,
        },
        {
            id: 'schedule',
            label: 'Schedule & Retention',
            icon: CalendarClock,
            badge:
                schedule?.scheduled && !schedule.suspended
                    ? 'Active'
                    : undefined,
        },
        {
            id: 'destination',
            label: 'Storage Destination',
            icon: HardDrive,
        },
        {
            id: 'recovery',
            label: 'Recovery Card & DR',
            icon: KeyRound,
            badge: needsCard ? '!' : undefined,
        },
    ];

    return (
        <>
            <Head title={`Backups · ${server.name}`} />

            <div className="mx-auto max-w-7xl space-y-6">
                {/* Header with Server Switcher */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500 ring-1 ring-teal-500/20">
                                <DatabaseBackup className="size-4.5" />
                            </div>
                            <h1 className="text-xl font-bold tracking-tight text-ink">
                                Backups &amp; Disaster Recovery
                            </h1>
                            <ExperimentalBadge side="bottom" />
                            {isLocal ? (
                                <StatusPill tone="muted">
                                    Local Cluster
                                </StatusPill>
                            ) : configured ? (
                                schedule?.scheduled && !schedule.suspended ? (
                                    <StatusPill tone="ok">Scheduled</StatusPill>
                                ) : (
                                    <StatusPill tone="ok">
                                        Configured
                                    </StatusPill>
                                )
                            ) : (
                                <StatusPill tone="bad">
                                    Not Backed Up
                                </StatusPill>
                            )}
                            {!isLocal && (
                                <SyncStatusBadge
                                    status={backupSync.status}
                                    lastSyncedAt={backupSync.lastSyncedAt}
                                    error={backupSync.error}
                                    subject="backups"
                                />
                            )}
                        </div>
                        <p className="mt-1 text-xs text-soft">
                            Encrypted Restic cluster snapshots, automated cron
                            schedules, and point-in-time disaster recovery.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <ServerSwitcher
                            servers={servers}
                            value={server.name}
                            buildHref={(name) =>
                                `/servers/${encodeURIComponent(name)}/backups`
                            }
                        />

                        {!isLocal && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                disabled={refreshing || isSyncing}
                                onClick={handleRefresh}
                                title="Re-sync backup status and snapshot list from cluster"
                            >
                                <RotateCw
                                    className={`h-4 w-4 ${refreshing || isSyncing ? 'animate-spin' : ''}`}
                                />
                                <span>
                                    {refreshing || isSyncing
                                        ? 'Syncing…'
                                        : 'Refresh'}
                                </span>
                            </Button>
                        )}

                        {!isLocal && configured && (
                            <Link
                                href={`${base}/run`}
                                method="post"
                                as="button"
                                className={buttonClass('primary', 'md')}
                            >
                                <Play className="h-4 w-4" />
                                <span>Back up now</span>
                            </Link>
                        )}

                        {!isLocal && !configured && (
                            <Button
                                type="button"
                                variant="primary"
                                size="md"
                                onClick={() => setDialog('setup')}
                            >
                                <Plus className="h-4 w-4" />
                                <span>Set up Backups</span>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Fleet Disaster Recovery Posture Strip */}
                {fleet.total > 0 && (
                    <div className="flex flex-col justify-between gap-3 rounded-2xl bg-surface px-5 py-3.5 ring-1 ring-line ring-inset sm:flex-row sm:items-center">
                        <div className="flex items-center gap-3">
                            <div
                                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                                    fleet.protected === fleet.total
                                        ? 'bg-ok-tint text-ok'
                                        : 'bg-warn-tint text-warn'
                                }`}
                            >
                                {fleet.protected === fleet.total ? (
                                    <ShieldCheck className="size-4.5" />
                                ) : (
                                    <ShieldAlert className="size-4.5" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-ink">
                                        Fleet Disaster Recovery Posture:{' '}
                                        {fleet.protected}/{fleet.total} cloud
                                        clusters protected
                                    </span>
                                </div>
                                <p className="text-[11px] text-soft">
                                    {fleet.protected === fleet.total
                                        ? 'Every cloud cluster has off-server encrypted backups configured.'
                                        : `${fleet.total - fleet.protected} cloud cluster${fleet.total - fleet.protected === 1 ? ' has' : 's have'} no off-server backup bucket configured yet.`}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {fleet.servers.map((cs) => (
                                <Link
                                    key={cs.name}
                                    href={`/servers/${encodeURIComponent(cs.name)}/backups`}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition ${
                                        cs.name === server.name
                                            ? 'bg-brand/10 text-brand ring-brand/40'
                                            : 'bg-paper text-ink ring-line hover:ring-soft'
                                    }`}
                                >
                                    <ProviderLogo
                                        provider={cs.provider}
                                        size="xs"
                                        className="size-3.5 shrink-0"
                                    />
                                    <span>{cs.name}</span>
                                    {cs.configured ? (
                                        <ShieldCheck className="size-3.5 text-ok" />
                                    ) : (
                                        <ShieldAlert className="size-3.5 text-warn" />
                                    )}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recovery Card Alert Banner when unacknowledged */}
                {needsCard && (
                    <div className="rounded-xl bg-warn-tint p-4 ring-1 ring-warn-line">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                            <div>
                                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                                    <AlertCircle className="size-4 text-warn" />
                                    Save your encryption recovery card
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-soft">
                                    It holds the passphrase that unlocks{' '}
                                    <span className="font-medium text-ink">
                                        {server.name}
                                    </span>
                                    &rsquo;s backups. Without it they cannot be
                                    decrypted, and it is never stored on the
                                    server. Save a copy in your password manager
                                    on another device.
                                </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-3">
                                <Link
                                    href={`${base}/recovery-card`}
                                    method="post"
                                    as="button"
                                    className={buttonClass('secondary', 'sm')}
                                >
                                    <FolderOpen className="size-3.5" />
                                    <span>Show Recovery Card</span>
                                </Link>
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                                    <input
                                        type="checkbox"
                                        checked={saved}
                                        onChange={(event) => {
                                            try {
                                                window.localStorage.setItem(
                                                    cardKey(server.name),
                                                    event.target.checked
                                                        ? '1'
                                                        : '0',
                                                );
                                            } catch {
                                                // ignore storage error
                                            }
                                            setSaved(event.target.checked);
                                        }}
                                    />
                                    I saved a copy safely
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {isLocal ? (
                    <Card>
                        <div className="py-8 text-center">
                            <DatabaseBackup className="mx-auto mb-3 size-8 text-faint" />
                            <h2 className="text-base font-semibold text-ink">
                                {server.name} is a local development cluster
                            </h2>
                            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-soft">
                                Off-server encrypted Restic backups are designed
                                for cloud production clusters. Select a cloud
                                server from the switcher above to manage its
                                snapshots, schedule, and recovery card.
                            </p>
                        </div>
                    </Card>
                ) : !configured ? (
                    <Card>
                        <div className="py-10 text-center">
                            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-500 ring-1 ring-teal-500/20">
                                <DatabaseBackup className="size-6" />
                            </div>
                            <h2 className="text-base font-semibold text-ink">
                                {server.name} has no off-server backups yet
                            </h2>
                            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-soft">
                                Your databases, shared tools, and persistent
                                volumes live only on this server. Set up an
                                encrypted S3 or Cloudflare R2 bucket so you can
                                restore everything if the server is ever lost.
                            </p>
                            <div className="mt-5 flex justify-center">
                                <Button
                                    type="button"
                                    variant="primary"
                                    onClick={() => setDialog('setup')}
                                >
                                    <Plus className="size-4" />
                                    <span>Set up Backups</span>
                                </Button>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {/* Tab Navigation */}
                        <div className="flex items-center gap-6 border-b border-line">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative flex items-center gap-2 pb-3 text-xs font-medium transition ${
                                            isActive
                                                ? 'text-brand'
                                                : 'text-soft hover:text-ink'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span>{tab.label}</span>
                                        {tab.badge !== undefined && (
                                            <span
                                                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                                    tab.badge === '!'
                                                        ? 'bg-warn-tint text-warn'
                                                        : isActive
                                                          ? 'bg-brand/10 text-brand'
                                                          : 'bg-paper text-soft'
                                                }`}
                                            >
                                                {tab.badge}
                                            </span>
                                        )}
                                        {isActive && (
                                            <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-brand" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* TAB 1: SNAPSHOTS & RESTORE */}
                        {activeTab === 'snapshots' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <Card>
                                        <p className="text-xs font-medium text-soft">
                                            Latest Snapshot
                                        </p>
                                        <p className="mt-1 text-lg font-semibold text-ink">
                                            {last
                                                ? ago(last.taken)
                                                : 'None yet'}
                                        </p>
                                        <p className="mt-0.5 font-mono text-[11px] text-soft">
                                            {last
                                                ? `${last.taken} · ${formatBytes(last.bytes)}`
                                                : 'Press Back up now to take the first snapshot'}
                                        </p>
                                    </Card>
                                    <Card>
                                        <p className="text-xs font-medium text-soft">
                                            Total Restore Points
                                        </p>
                                        <p className="mt-1 text-lg font-semibold text-ink">
                                            {entries.length}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-soft">
                                            {incomplete > 0
                                                ? `${incomplete} incomplete snapshot(s) can be pruned`
                                                : 'All snapshots verified complete'}
                                        </p>
                                    </Card>
                                    <Card className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-medium text-soft">
                                                Retention Maintenance
                                            </p>
                                            <p className="mt-1 text-xs text-soft">
                                                Keep 7 daily, 4 weekly &amp; 6
                                                monthly snapshots.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setDialog('prune')}
                                        >
                                            <Trash2 className="size-3.5" />
                                            <span>Prune Old</span>
                                        </Button>
                                    </Card>
                                </div>

                                <Card className="overflow-hidden p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-line bg-paper/50 text-soft">
                                                    <th className="px-5 py-3 font-medium">
                                                        Snapshot Timestamp
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Age
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Size
                                                    </th>
                                                    <th className="px-5 py-3 font-medium">
                                                        Items (DBs &amp;
                                                        Volumes)
                                                    </th>
                                                    <th className="px-5 py-3 text-right font-medium">
                                                        Actions
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-line text-ink">
                                                {entries.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={5}
                                                            className="px-5 py-10 text-center text-soft"
                                                        >
                                                            {backup?.backups
                                                                ?.available ===
                                                            false
                                                                ? 'Install the AWS CLI in Setup to list snapshots.'
                                                                : 'No snapshots taken yet. Click "Back up now" to create your first restore point.'}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    entries.map((entry) => (
                                                        <tr
                                                            key={entry.id}
                                                            className="transition hover:bg-paper/30"
                                                        >
                                                            <td className="px-5 py-3.5 font-mono font-medium text-ink">
                                                                {entry.taken}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-soft">
                                                                {ago(
                                                                    entry.taken,
                                                                )}
                                                            </td>
                                                            <td className="px-5 py-3.5 font-mono text-soft">
                                                                {formatBytes(
                                                                    entry.bytes,
                                                                )}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-soft">
                                                                {entry.items}{' '}
                                                                item
                                                                {entry.items ===
                                                                1
                                                                    ? ''
                                                                    : 's'}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-right">
                                                                <div className="inline-flex items-center justify-end gap-1.5">
                                                                    <Form
                                                                        action={`${base}/check`}
                                                                        method="post"
                                                                    >
                                                                        <input
                                                                            type="hidden"
                                                                            name="backup"
                                                                            value={
                                                                                entry.id
                                                                            }
                                                                        />
                                                                        <Button
                                                                            type="submit"
                                                                            variant="secondary"
                                                                            size="sm"
                                                                        >
                                                                            <CheckCircle2 className="size-3.5" />
                                                                            <span>
                                                                                Verify
                                                                            </span>
                                                                        </Button>
                                                                    </Form>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-accent"
                                                                        onClick={() =>
                                                                            setDialog(
                                                                                {
                                                                                    restore:
                                                                                        entry,
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        <RotateCcw className="size-3.5" />
                                                                        <span>
                                                                            Restore…
                                                                        </span>
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* TAB 2: SCHEDULE & RETENTION */}
                        {activeTab === 'schedule' && (
                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card
                                    label="Automated Backup Schedule"
                                    action={
                                        schedule?.scheduled &&
                                        !schedule.suspended ? (
                                            <StatusPill tone="ok">
                                                Active
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="muted">
                                                Manual Only
                                            </StatusPill>
                                        )
                                    }
                                >
                                    <p className="text-sm font-medium text-ink">
                                        {schedule?.scheduled
                                            ? describeSchedule(
                                                  schedule.cron,
                                                  schedule.timezone,
                                              )
                                            : 'No automated schedule configured'}
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-soft">
                                        {schedule?.scheduled
                                            ? `Kubernetes CronJob runs automatically on ${server.name} using schedule "${schedule.cron}".`
                                            : 'Backups currently run only when you click "Back up now". Enable a schedule so new snapshots are captured automatically.'}
                                    </p>
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            onClick={() =>
                                                setDialog('schedule')
                                            }
                                        >
                                            <CalendarClock className="size-3.5" />
                                            <span>
                                                {schedule?.scheduled
                                                    ? 'Change Schedule'
                                                    : 'Enable Schedule'}
                                            </span>
                                        </Button>
                                        {schedule?.scheduled && (
                                            <Link
                                                href={`${base}/unschedule`}
                                                method="post"
                                                as="button"
                                                className={buttonClass(
                                                    'secondary',
                                                    'sm',
                                                )}
                                            >
                                                <XCircle className="size-3.5" />
                                                <span>Stop Schedule</span>
                                            </Link>
                                        )}
                                    </div>
                                </Card>

                                <Card label="Retention & Cleanup Policy">
                                    <p className="text-sm font-medium text-ink">
                                        Grandfather-Father-Son (GFS) Retention
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-soft">
                                        Pruning keeps every snapshot from the
                                        last <strong>7 days</strong>, the newest
                                        snapshot of each of the last{' '}
                                        <strong>4 weeks</strong>, and the newest
                                        of each of the last{' '}
                                        <strong>6 months</strong>, while
                                        cleaning up any incomplete uploads.
                                    </p>
                                    <div className="mt-4">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setDialog('prune')}
                                        >
                                            <Trash2 className="size-3.5" />
                                            <span>
                                                Preview / Prune Old Backups
                                            </span>
                                        </Button>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* TAB 3: STORAGE DESTINATION */}
                        {activeTab === 'destination' && (
                            <Card
                                label="S3 / Cloudflare R2 Destination"
                                action={
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setDialog('setup')}
                                    >
                                        <HardDrive className="size-3.5" />
                                        <span>Change Destination</span>
                                    </Button>
                                }
                            >
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="rounded-xl bg-paper p-4 ring-1 ring-line">
                                        <p className="text-[11px] font-medium tracking-wide text-soft uppercase">
                                            Bucket Name
                                        </p>
                                        <p className="mt-1 font-mono text-sm font-semibold text-ink">
                                            {backup?.destination?.bucket ?? '—'}
                                        </p>
                                    </div>
                                    <div className="rounded-xl bg-paper p-4 ring-1 ring-line">
                                        <p className="text-[11px] font-medium tracking-wide text-soft uppercase">
                                            S3 Endpoint URL
                                        </p>
                                        <p className="mt-1 truncate font-mono text-sm font-semibold text-ink">
                                            {backup?.destination?.endpoint ??
                                                '—'}
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-4 text-xs text-soft">
                                    All snapshots are encrypted client-side on{' '}
                                    <span className="font-medium text-ink">
                                        {server.name}
                                    </span>{' '}
                                    before being uploaded to this bucket.
                                </p>
                            </Card>
                        )}

                        {/* TAB 4: RECOVERY CARD & DR */}
                        {activeTab === 'recovery' && (
                            <div className="grid gap-6 lg:grid-cols-2">
                                <Card
                                    label="Encryption Recovery Card"
                                    action={
                                        saved ? (
                                            <StatusPill tone="ok">
                                                Saved Safely
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="warn">
                                                Save Copy Off-Device
                                            </StatusPill>
                                        )
                                    }
                                >
                                    <p className="text-xs leading-relaxed text-soft">
                                        The recovery card contains the
                                        encryption passphrase and bucket
                                        coordinates needed to decrypt{' '}
                                        <span className="font-medium text-ink">
                                            {server.name}
                                        </span>
                                        &rsquo;s backups during a disaster. It
                                        is stored locally on this machine and
                                        never kept on the cluster.
                                    </p>
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <Link
                                            href={`${base}/recovery-card`}
                                            method="post"
                                            as="button"
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                            )}
                                        >
                                            <FolderOpen className="size-3.5" />
                                            <span>Show Recovery Card File</span>
                                        </Link>
                                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                                            <input
                                                type="checkbox"
                                                checked={saved}
                                                onChange={(event) => {
                                                    try {
                                                        window.localStorage.setItem(
                                                            cardKey(
                                                                server.name,
                                                            ),
                                                            event.target.checked
                                                                ? '1'
                                                                : '0',
                                                        );
                                                    } catch {
                                                        // ignore
                                                    }
                                                    setSaved(
                                                        event.target.checked,
                                                    );
                                                }}
                                            />
                                            I saved a copy in my password
                                            manager
                                        </label>
                                    </div>
                                </Card>

                                <Card label="Disaster Recovery Runbook">
                                    <ol className="list-inside list-decimal space-y-2 text-xs leading-relaxed text-soft">
                                        <li>
                                            <strong className="text-ink">
                                                Verify integrity regularly:
                                            </strong>{' '}
                                            Use the <strong>Verify</strong>{' '}
                                            button on the Snapshots tab to run a
                                            non-destructive dry-run check.
                                        </li>
                                        <li>
                                            <strong className="text-ink">
                                                Point-in-time restore:
                                            </strong>{' '}
                                            Click <strong>Restore…</strong> on
                                            any snapshot and type the database
                                            or volume name to roll it back.
                                        </li>
                                        <li>
                                            <strong className="text-ink">
                                                Full server replacement:
                                            </strong>{' '}
                                            Provision a replacement cluster,
                                            connect the same S3/R2 bucket with
                                            your recovery card passphrase, and
                                            restore your databases and volumes.
                                        </li>
                                    </ol>
                                </Card>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {dialog === 'setup' && (
                <SetupDialog
                    base={base}
                    server={server}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'schedule' && (
                <ScheduleDialog
                    base={base}
                    current={schedule?.cron ?? null}
                    timezone={schedule?.timezone ?? null}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === 'prune' && (
                <PruneDialog base={base} onClose={() => setDialog(null)} />
            )}
            {dialog !== null &&
                typeof dialog === 'object' &&
                'restore' in dialog && (
                    <RestoreDialog
                        base={base}
                        entry={dialog.restore}
                        onClose={() => setDialog(null)}
                    />
                )}
        </>
    );
}

function Modal({
    title,
    intro,
    children,
}: {
    title: string;
    intro: string;
    children: ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-line">
                <h3 className="text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-soft">
                    {intro}
                </p>
                {children}
            </div>
        </div>
    );
}

function Labeled({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-soft">
                {label}
            </span>
            {children}
            {error && (
                <span className="mt-1 block text-xs text-accent">{error}</span>
            )}
        </label>
    );
}

function SetupDialog({
    base,
    server,
    onClose,
}: {
    base: string;
    server: Server;
    onClose: () => void;
}) {
    const [createBucket, setCreateBucket] = useState(false);

    return (
        <Modal
            title="Set up backups"
            intro={`Choose where backups of ${server.name} are kept. It must be a bucket outside this server. Cloudflare R2 has a free tier and no download fees.`}
        >
            <Form
                action={`${base}/setup`}
                method="post"
                className="mt-5 space-y-4"
                onSuccess={onClose}
            >
                {({ processing, errors }) => (
                    <>
                        <Labeled label="Endpoint" error={errors.endpoint}>
                            <input
                                name="endpoint"
                                required
                                placeholder="https://<account-id>.r2.cloudflarestorage.com"
                                className={`${field} font-mono`}
                            />
                        </Labeled>
                        <Labeled label="Bucket" error={errors.bucket}>
                            <input
                                name="bucket"
                                required
                                placeholder="my-server-backups"
                                className={`${field} font-mono`}
                            />
                        </Labeled>
                        <div className="grid grid-cols-2 gap-3">
                            <Labeled
                                label="Access key"
                                error={errors.access_key}
                            >
                                <input
                                    name="access_key"
                                    required
                                    autoComplete="off"
                                    className={`${field} font-mono`}
                                />
                            </Labeled>
                            <Labeled
                                label="Secret key"
                                error={errors.secret_key}
                            >
                                <input
                                    name="secret_key"
                                    type="password"
                                    required
                                    autoComplete="off"
                                    className={field}
                                />
                            </Labeled>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                            <input
                                type="checkbox"
                                name="create_bucket"
                                value="1"
                                checked={createBucket}
                                onChange={(event) =>
                                    setCreateBucket(event.target.checked)
                                }
                            />
                            Create the bucket for me (Cloudflare R2)
                        </label>
                        {createBucket && (
                            <Labeled
                                label="Cloudflare API token (used once, never saved)"
                                error={errors.cloudflare_token}
                            >
                                <input
                                    name="cloudflare_token"
                                    type="password"
                                    autoComplete="off"
                                    className={field}
                                />
                            </Labeled>
                        )}
                        <p className="text-[11px] leading-relaxed text-soft">
                            The keys are given to the CLI directly and are not
                            kept in the activity log. Next, a recovery card with
                            your backup passphrase is saved on this computer.
                        </p>
                        <div className="flex justify-end gap-2.5 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button type="submit" disabled={processing}>
                                <DatabaseBackup className="size-3.5" />
                                <span>
                                    {processing
                                        ? 'Starting…'
                                        : 'Set up backups'}
                                </span>
                            </Button>
                        </div>
                    </>
                )}
            </Form>
        </Modal>
    );
}

function ScheduleDialog({
    base,
    current,
    timezone,
    onClose,
}: {
    base: string;
    current: string | null;
    timezone: string | null;
    onClose: () => void;
}) {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const initial =
        SCHEDULES.find((schedule) => schedule.cron === current)?.value ??
        'nightly';
    const [choice, setChoice] = useState<string>(initial);

    return (
        <Modal
            title="Backup schedule"
            intro="Backups run on the server at these times."
        >
            <Form
                action={`${base}/schedule`}
                method="post"
                className="mt-5 space-y-4"
                onSuccess={onClose}
            >
                {({ processing, errors }) => (
                    <>
                        <div className="space-y-2">
                            {SCHEDULES.map((schedule) => (
                                <label
                                    key={schedule.value}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 ring-1 ${choice === schedule.value ? 'bg-accent-tint ring-accent' : 'bg-paper ring-line'}`}
                                >
                                    <input
                                        type="radio"
                                        name="schedule"
                                        value={schedule.value}
                                        checked={choice === schedule.value}
                                        onChange={() =>
                                            setChoice(schedule.value)
                                        }
                                    />
                                    <span className="text-sm font-medium text-ink">
                                        {describeSchedule(schedule.cron, null)}
                                    </span>
                                </label>
                            ))}
                        </div>
                        {errors.schedule && (
                            <p className="text-xs text-accent">
                                {errors.schedule}
                            </p>
                        )}
                        <Labeled label="Timezone" error={errors.timezone}>
                            <input
                                name="timezone"
                                defaultValue={timezone ?? detected}
                                className={`${field} font-mono`}
                            />
                        </Labeled>
                        <div className="flex justify-end gap-2.5 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button type="submit" disabled={processing}>
                                <CalendarClock className="size-3.5" />
                                <span>
                                    {processing ? 'Saving…' : 'Save schedule'}
                                </span>
                            </Button>
                        </div>
                    </>
                )}
            </Form>
        </Modal>
    );
}

function PruneDialog({ base, onClose }: { base: string; onClose: () => void }) {
    const [understood, setUnderstood] = useState(false);

    return (
        <Modal
            title="Clean up old backups"
            intro="Keeps every backup from the last 7 days, then the newest of each of the last 4 weeks and 6 months, and removes the rest, along with unfinished ones. Preview first: it shows what would be removed and deletes nothing."
        >
            <div className="mt-5 space-y-4">
                <Form
                    action={`${base}/prune`}
                    method="post"
                    onSuccess={onClose}
                >
                    <Button
                        type="submit"
                        variant="secondary"
                        className="w-full"
                    >
                        <CheckCircle2 className="size-3.5" />
                        <span>Preview what would be removed</span>
                    </Button>
                </Form>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-ink">
                    <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={understood}
                        onChange={(event) =>
                            setUnderstood(event.target.checked)
                        }
                    />
                    I looked at the preview and understand removed backups
                    cannot be recovered.
                </label>
                <Form
                    action={`${base}/prune`}
                    method="post"
                    onSuccess={onClose}
                >
                    <input type="hidden" name="apply" value="1" />
                    <Button
                        type="submit"
                        disabled={!understood}
                        className="w-full"
                    >
                        <Trash2 className="size-3.5" />
                        <span>Remove old backups</span>
                    </Button>
                </Form>
                <div className="flex justify-end">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        <XCircle className="size-3.5" />
                        <span>Cancel</span>
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function RestoreDialog({
    base,
    entry,
    onClose,
}: {
    base: string;
    entry: BackupEntry;
    onClose: () => void;
}) {
    const [kind, setKind] = useState<'database' | 'volume'>('database');
    const [name, setName] = useState('');
    const [confirm, setConfirm] = useState('');

    return (
        <Modal
            title="Restore from a backup"
            intro={`This replaces live data with the copy taken ${entry.taken}. A volume's service is stopped while it is restored. Press Verify on the backup first if you have not.`}
        >
            <Form
                action={`${base}/restore`}
                method="post"
                className="mt-5 space-y-4"
                onSuccess={onClose}
            >
                {({ processing, errors }) => (
                    <>
                        <input type="hidden" name="backup" value={entry.id} />
                        <input type="hidden" name="kind" value={kind} />
                        <div className="grid grid-cols-2 gap-2">
                            {(['database', 'volume'] as const).map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setKind(option)}
                                    className={`rounded-lg p-2.5 text-xs font-semibold ring-1 ${kind === option ? 'bg-accent-tint ring-accent' : 'bg-paper ring-line'}`}
                                >
                                    {option === 'database'
                                        ? 'A database'
                                        : 'A volume'}
                                </button>
                            ))}
                        </div>
                        <Labeled
                            label={`Name of the ${kind} (as shown in the check)`}
                            error={errors.name}
                        >
                            <input
                                name="name"
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                required
                                className={`${field} font-mono`}
                            />
                        </Labeled>
                        <Labeled
                            label="Type the name again to confirm"
                            error={errors.confirm}
                        >
                            <input
                                name="confirm"
                                value={confirm}
                                onChange={(event) =>
                                    setConfirm(event.target.value)
                                }
                                required
                                autoComplete="off"
                                className={`${field} font-mono`}
                            />
                        </Labeled>
                        <div className="flex justify-end gap-2.5 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                type="submit"
                                variant="danger"
                                disabled={
                                    processing ||
                                    name === '' ||
                                    confirm !== name
                                }
                            >
                                <RotateCcw className="size-3.5" />
                                <span>
                                    {processing ? 'Starting…' : 'Restore'}
                                </span>
                            </Button>
                        </div>
                    </>
                )}
            </Form>
        </Modal>
    );
}
