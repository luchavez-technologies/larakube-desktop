import { useState } from 'react';
import { Link } from '@inertiajs/react';
import {
    Eye,
    EyeOff,
    ExternalLink,
    KeyRound,
    Laptop,
    Pause,
    Play,
    Plus,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ExternalLinkButton } from '@/lib/open-external';
import QrCodePopover from '@/components/qr-code-popover';
import StatusPill from '@/components/status-pill';
import ToolLogo from '@/components/tool-logo';
import { cn } from '@/lib/utils';
import type {
    CompanionApp,
    CompanionCredential,
    Project,
} from '@/types/larakube';

const DEFAULT_COMPANIONS: CompanionApp[] = [
    {
        slug: 'adminer',
        name: 'Adminer',
        description:
            'Universal lightweight manager for MySQL, MariaDB, PostgreSQL, and SQLite.',
        icon: '🗄️',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'phpmyadmin',
        name: 'phpMyAdmin',
        description: 'Dedicated web interface for MySQL and MariaDB servers.',
        icon: '🐬',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'pgadmin',
        name: 'pgAdmin',
        description:
            'Full-featured web administration platform for PostgreSQL.',
        icon: '🐘',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'redisinsight',
        name: 'RedisInsight',
        description:
            'Visual GUI for Redis keys, streams, memory, and pub/sub metrics.',
        icon: '⚡',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
    {
        slug: 'mongo-express',
        name: 'Mongo Express',
        description:
            'Web-based admin interface for MongoDB databases and documents.',
        icon: '🍃',
        installed: false,
        running: false,
        paused: false,
        url: null,
    },
];

/** Host/user/password/database for a running companion, masked until clicked. */
function ConnectionDetails({
    credential,
}: {
    credential: CompanionCredential;
}) {
    const [revealed, setRevealed] = useState(false);
    const fields: { label: string; value: string | null }[] = [
        { label: 'Host', value: credential.host },
        { label: 'User', value: credential.user },
        { label: 'Password', value: credential.password },
        { label: 'Database', value: credential.database },
    ].filter((f) => f.value !== null);

    if (fields.length === 0) return null;

    return (
        <div className="mt-3 space-y-1 rounded-lg bg-paper/70 p-2.5 text-[11px]">
            <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 font-medium text-faint">
                    <KeyRound className="size-3" />
                    <span>Connect using</span>
                </span>
                <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    className="flex items-center gap-1 text-faint hover:text-ink"
                    title={revealed ? 'Hide password' : 'Reveal password'}
                >
                    {revealed ? (
                        <EyeOff className="size-3" />
                    ) : (
                        <Eye className="size-3" />
                    )}
                </button>
            </div>
            {fields.map(({ label, value }) => (
                <div
                    key={label}
                    className="flex items-center justify-between gap-2"
                >
                    <span className="shrink-0 text-faint">{label}</span>
                    <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate font-mono text-ink">
                            {label === 'Password' && !revealed
                                ? '••••••••'
                                : value}
                        </span>
                        <CopyButton
                            value={value ?? ''}
                            label=""
                            copiedLabel=""
                            size="xs"
                            variant="ghost"
                            className="h-4 w-4 shrink-0 p-0 text-faint hover:text-ink"
                            title={`Copy ${label.toLowerCase()}`}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function LocalDevCompanionsCard({
    project,
    companions,
    companionCredentials,
    localTld = 'test',
}: {
    project: Project;
    companions?: CompanionApp[] | null;
    companionCredentials?: CompanionCredential[] | null;
    localTld?: string;
}) {
    const list = companions ?? DEFAULT_COMPANIONS;
    const runningCount = list.filter((c) => c.installed && c.running).length;
    const credentialFor = (name: string): CompanionCredential | undefined =>
        (companionCredentials ?? []).find((c) => c.companion === name);

    // Detect matched companions based on project database / cache
    const db = (project.database ?? '').toLowerCase();
    const cache = (project.cacheDriver ?? '').toLowerCase();

    const matchBadges: Record<string, string | null> = {
        adminer:
            db.includes('mysql') ||
            db.includes('maria') ||
            db.includes('pgsql') ||
            db.includes('postgres') ||
            db.includes('sqlite')
                ? `Recommended for ${db.toUpperCase()}`
                : null,
        phpmyadmin:
            db.includes('mysql') || db.includes('maria')
                ? 'Matches project MySQL'
                : null,
        pgadmin:
            db.includes('pgsql') ||
            db.includes('postgres') ||
            db.includes('postgresql')
                ? 'Matches project PostgreSQL'
                : null,
        redisinsight: cache.includes('redis') ? 'Matches project Redis' : null,
        'mongo-express': db.includes('mongo')
            ? 'Matches project MongoDB'
            : null,
    };

    const getMatchBadge = (targetSlug: string): string | null =>
        matchBadges[targetSlug] ?? null;

    return (
        <Card
            label="Local Dev Companions"
            action={
                <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-soft ring-1 ring-line">
                    <Laptop className="size-3 text-brand" />
                    <span>
                        {runningCount}{' '}
                        {runningCount === 1 ? 'active' : 'active'}
                    </span>
                </span>
            }
        >
            <div className="space-y-4">
                <div className="rounded-xl border border-line bg-paper/50 p-3 text-xs leading-relaxed text-soft">
                    Zero-configuration database and cache web GUIs running
                    directly in{' '}
                    <code className="font-mono text-ink">
                        larakube-companions
                    </code>{' '}
                    on your local cluster. Accessible over secure local domains
                    (e.g.{' '}
                    <code className="font-mono text-ink">
                        https://adminer.{localTld}
                    </code>
                    ).
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {list.map((companion) => {
                        const matchBadge = getMatchBadge(companion.slug);

                        return (
                            <div
                                key={companion.slug}
                                className={cn(
                                    'group flex flex-col justify-between rounded-xl border p-4 transition-all duration-150',
                                    companion.installed && companion.running
                                        ? 'border-emerald-500/30 bg-emerald-500/5'
                                        : 'border-line bg-paper/60',
                                )}
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="flex items-center gap-3">
                                            <ToolLogo
                                                slug={companion.slug}
                                                size="md"
                                            />
                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <h4 className="text-sm font-semibold text-ink">
                                                        {companion.name}
                                                    </h4>
                                                </div>
                                                <div className="mt-0.5">
                                                    {companion.installed ? (
                                                        companion.running ? (
                                                            <StatusPill tone="ok">
                                                                Running
                                                            </StatusPill>
                                                        ) : (
                                                            <StatusPill tone="warn">
                                                                ⏸ Paused
                                                            </StatusPill>
                                                        )
                                                    ) : (
                                                        <StatusPill tone="muted">
                                                            Available
                                                        </StatusPill>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {matchBadge && (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand ring-1 ring-brand/20">
                                                <Sparkles className="size-2.5" />
                                                <span>{matchBadge}</span>
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-2.5 text-xs leading-relaxed text-soft">
                                        {companion.description}
                                    </p>
                                </div>

                                <div className="mt-3.5 flex items-center justify-between border-t border-line/60 pt-3">
                                    <span className="font-mono text-[11px] text-faint">
                                        {companion.url ??
                                            `${companion.slug}.${localTld}`}
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                        {companion.installed ? (
                                            <>
                                                {companion.url &&
                                                    companion.running && (
                                                        <>
                                                            <QrCodePopover
                                                                url={
                                                                    companion.url
                                                                }
                                                                title={
                                                                    companion.name
                                                                }
                                                                description={`Scan to open ${companion.name} on phone`}
                                                            />
                                                            <ExternalLinkButton
                                                                url={
                                                                    companion.url
                                                                }
                                                                className={buttonClass(
                                                                    'secondary',
                                                                    'sm',
                                                                    'gap-1',
                                                                )}
                                                            >
                                                                <ExternalLink className="size-3" />
                                                                <span>
                                                                    Open
                                                                </span>
                                                            </ExternalLinkButton>
                                                        </>
                                                    )}
                                                {companion.running ? (
                                                    <Link
                                                        href="/companions/stop"
                                                        method="post"
                                                        data={{
                                                            companion:
                                                                companion.slug,
                                                        }}
                                                        as="button"
                                                        preserveScroll
                                                        className={buttonClass(
                                                            'ghost',
                                                            'sm',
                                                            'gap-1 text-soft',
                                                        )}
                                                        title="Pause companion to free RAM"
                                                    >
                                                        <Pause className="size-3" />
                                                        <span>Pause</span>
                                                    </Link>
                                                ) : (
                                                    <Link
                                                        href="/companions/start"
                                                        method="post"
                                                        data={{
                                                            companion:
                                                                companion.slug,
                                                        }}
                                                        as="button"
                                                        preserveScroll
                                                        className={buttonClass(
                                                            'secondary',
                                                            'sm',
                                                            'gap-1',
                                                        )}
                                                        title="Resume companion"
                                                    >
                                                        <Play className="size-3" />
                                                        <span>Resume</span>
                                                    </Link>
                                                )}
                                                <Link
                                                    href="/companions/remove"
                                                    method="post"
                                                    data={{
                                                        companion:
                                                            companion.slug,
                                                    }}
                                                    as="button"
                                                    preserveScroll
                                                    className={buttonClass(
                                                        'danger',
                                                        'sm',
                                                        'p-1.5',
                                                    )}
                                                    title="Remove companion"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Link>
                                            </>
                                        ) : (
                                            <Link
                                                href="/companions/add"
                                                method="post"
                                                data={{
                                                    companion: companion.slug,
                                                }}
                                                as="button"
                                                preserveScroll
                                                className={buttonClass(
                                                    'primary',
                                                    'sm',
                                                    'gap-1',
                                                )}
                                                title={`Install ${companion.name}`}
                                            >
                                                <Plus className="size-3" />
                                                <span>Install</span>
                                            </Link>
                                        )}
                                    </div>
                                </div>

                                {companion.installed &&
                                    companion.running &&
                                    (() => {
                                        const credential = credentialFor(
                                            companion.name,
                                        );

                                        return credential ? (
                                            <ConnectionDetails
                                                credential={credential}
                                            />
                                        ) : null;
                                    })()}
                            </div>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
