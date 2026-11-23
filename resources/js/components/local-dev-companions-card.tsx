import { useState } from 'react';
import { Link } from '@inertiajs/react';
import {
    ArrowUpCircle,
    Eye,
    EyeOff,
    ExternalLink,
    KeyRound,
    Laptop,
    Pause,
    Play,
    Download,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ImageRef from '@/components/image-ref';
import ServiceCard from '@/components/service-card';
import CopyButton from '@/components/copy-button';
import { ExternalLinkButton } from '@/lib/open-external';
import QrCodePopover from '@/components/qr-code-popover';
import StatusPill from '@/components/status-pill';
import ToolLogo from '@/components/tool-logo';
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
export function ConnectionDetails({
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
        <div className="space-y-1 border-t border-line/60 pt-2 text-[11px]">
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

/** Which companions suit a database/cache driver pair, e.g. pgAdmin for Postgres. */
export function companionFits(
    slug: string,
    database: string | null | undefined,
    cacheDriver: string | null | undefined,
): boolean {
    const db = (database ?? '').toLowerCase();
    const cache = (cacheDriver ?? '').toLowerCase();
    const mysql = db.includes('mysql') || db.includes('maria');
    const postgres = db.includes('pgsql') || db.includes('postgres');

    switch (slug) {
        case 'adminer':
            return mysql || postgres || db.includes('sqlite');
        case 'phpmyadmin':
            return mysql;
        case 'pgadmin':
            return postgres;
        case 'redisinsight':
            return cache.includes('redis');
        case 'mongo-express':
            return db.includes('mongo');
        default:
            return false;
    }
}

export type CompanionUser = {
    name: string;
    database: string | null;
    cacheDriver: string | null;
};

/**
 * The shared dev companions of the local cluster. On the Local page
 * (`projects`) each one says which local projects it suits; with a single
 * `project` it says whether it matches that one.
 */
export default function LocalDevCompanionsCard({
    project,
    projects,
    companions,
    companionCredentials,
    localTld = 'test',
}: {
    project?: Project;
    projects?: CompanionUser[];
    companions?: CompanionApp[] | null;
    companionCredentials?: CompanionCredential[] | null;
    localTld?: string;
}) {
    if (companions === undefined) {
        return <LocalDevCompanionsCardSkeleton localTld={localTld} />;
    }

    const list = companions ?? DEFAULT_COMPANIONS;
    const runningCount = list.filter((c) => c.installed && c.running).length;
    const credentialFor = (name: string): CompanionCredential | undefined =>
        (companionCredentials ?? []).find((c) => c.companion === name);

    const getMatchBadge = (slug: string): string | null => {
        if (project) {
            return companionFits(slug, project.database, project.cacheDriver)
                ? `Matches ${project.name}`
                : null;
        }

        const users = (projects ?? [])
            .filter((user) =>
                companionFits(slug, user.database, user.cacheDriver),
            )
            .map((user) => user.name);

        if (users.length === 0) return null;

        return users.length <= 3
            ? `Fits ${users.join(', ')}`
            : `Fits ${users.slice(0, 2).join(', ')} and ${users.length - 2} more`;
    };

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

                {/* Mailpit catches every local outbound email unconditionally —
                    it's core cluster infra (larakube-shared), not an opt-in
                    companion, so it never shows Install/Pause/Remove like the
                    ones below. */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-3">
                        <ToolLogo slug="mailpit" size="md" />
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h4 className="text-sm font-semibold text-ink">
                                    Mailpit
                                </h4>
                                <StatusPill tone="ok">
                                    Always running
                                </StatusPill>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-soft">
                                Catches every outbound email from your local
                                apps — nothing actually leaves your machine.
                            </p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        <QrCodePopover
                            url={`https://mailpit.${localTld}`}
                            title="Mailpit"
                            description="Scan to open Mailpit on phone"
                        />
                        <ExternalLinkButton
                            url={`https://mailpit.${localTld}`}
                            className={buttonClass('secondary', 'sm', 'gap-1')}
                        >
                            <ExternalLink className="size-3" />
                            <span>Open</span>
                        </ExternalLinkButton>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {list.map((companion) => {
                        const matchBadge = getMatchBadge(companion.slug);
                        const running =
                            companion.installed && companion.running;
                        const credential = running
                            ? credentialFor(companion.name)
                            : undefined;
                        const host =
                            companion.url ??
                            `https://${companion.slug}.${localTld}`;
                        const image =
                            companion.image ?? companion.available ?? null;

                        return (
                            <ServiceCard
                                key={companion.slug}
                                highlighted={running}
                                logo={
                                    <ToolLogo slug={companion.slug} size="md" />
                                }
                                title={companion.name}
                                status={
                                    companion.installed ? (
                                        companion.running ? (
                                            <StatusPill tone="ok">
                                                Running
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="warn">
                                                Paused
                                            </StatusPill>
                                        )
                                    ) : (
                                        <StatusPill tone="muted">
                                            Available
                                        </StatusPill>
                                    )
                                }
                                badge={
                                    matchBadge && (
                                        <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand ring-1 ring-brand/20">
                                            <Sparkles className="size-2.5" />
                                            <span>{matchBadge}</span>
                                        </span>
                                    )
                                }
                                info={[
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-mono text-[11px] text-soft">
                                            {host.replace(/^https?:\/\//, '')}
                                        </span>
                                        {running && companion.url && (
                                            <QrCodePopover
                                                url={companion.url}
                                                title={companion.name}
                                                description={`Scan to open ${companion.name} on phone`}
                                            />
                                        )}
                                    </div>,
                                    image ? (
                                        <ImageRef
                                            container={{
                                                running: image,
                                                available:
                                                    companion.installed &&
                                                    companion.available &&
                                                    companion.available !==
                                                        image
                                                        ? companion.available
                                                        : null,
                                            }}
                                        />
                                    ) : null,
                                    credential ? (
                                        <ConnectionDetails
                                            credential={credential}
                                        />
                                    ) : null,
                                ]}
                                actions={
                                    companion.installed ? (
                                        <>
                                            {companion.available &&
                                                companion.image &&
                                                companion.available !==
                                                    companion.image && (
                                                    <Link
                                                        href="/companions/update"
                                                        method="post"
                                                        data={{
                                                            companion:
                                                                companion.slug,
                                                        }}
                                                        as="button"
                                                        preserveScroll
                                                        className={buttonClass(
                                                            'primary',
                                                            'sm',
                                                            'gap-1',
                                                        )}
                                                        title={`Update ${companion.name} to ${companion.available}`}
                                                    >
                                                        <ArrowUpCircle className="size-3" />
                                                        <span>Update</span>
                                                    </Link>
                                                )}
                                            {running && companion.url && (
                                                <ExternalLinkButton
                                                    url={companion.url}
                                                    className={buttonClass(
                                                        'secondary',
                                                        'sm',
                                                        'gap-1',
                                                    )}
                                                >
                                                    <ExternalLink className="size-3" />
                                                    <span>Open</span>
                                                </ExternalLinkButton>
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
                                                        'secondary',
                                                        'sm',
                                                        'gap-1',
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
                                                    companion: companion.slug,
                                                }}
                                                as="button"
                                                preserveScroll
                                                className={buttonClass(
                                                    'danger',
                                                    'sm',
                                                    'gap-1',
                                                )}
                                                title={`Remove ${companion.name}`}
                                            >
                                                <Trash2 className="size-3.5" />
                                                <span>Remove</span>
                                            </Link>
                                        </>
                                    ) : (
                                        <Link
                                            href="/companions/add"
                                            method="post"
                                            data={{ companion: companion.slug }}
                                            as="button"
                                            preserveScroll
                                            className={buttonClass(
                                                'primary',
                                                'sm',
                                                'gap-1',
                                            )}
                                            title={`Install ${companion.name}`}
                                        >
                                            <Download className="size-3" />
                                            <span>Install</span>
                                        </Link>
                                    )
                                }
                            >
                                <p className="text-xs leading-relaxed text-soft">
                                    {companion.description}
                                </p>
                            </ServiceCard>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}

export function LocalDevCompanionsCardSkeleton({
    localTld = 'test',
}: {
    localTld?: string;
}) {
    return (
        <Card
            label="Local Dev Companions"
            action={
                <div className="flex animate-pulse items-center gap-1.5 rounded-full bg-paper px-2.5 py-0.5 ring-1 ring-line">
                    <Laptop className="size-3 text-faint" />
                    <div className="h-3 w-12 rounded bg-line" />
                </div>
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

                {/* Mailpit catches every local outbound email unconditionally — it's core cluster infra */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-3">
                        <ToolLogo slug="mailpit" size="md" />
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h4 className="text-sm font-semibold text-ink">
                                    Mailpit
                                </h4>
                                <StatusPill tone="ok">
                                    Always running
                                </StatusPill>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-soft">
                                Catches every outbound email from your local
                                apps — nothing actually leaves your machine.
                            </p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        <QrCodePopover
                            url={`https://mailpit.${localTld}`}
                            title="Mailpit"
                            description="Scan to open Mailpit on phone"
                        />
                        <ExternalLinkButton
                            url={`https://mailpit.${localTld}`}
                            className={buttonClass('secondary', 'sm', 'gap-1')}
                        >
                            <ExternalLink className="size-3" />
                            <span>Open</span>
                        </ExternalLinkButton>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                        {
                            nameW: 'w-20',
                            descW1: 'w-full',
                            descW2: 'w-4/5',
                            urlW: 'w-24',
                        },
                        {
                            nameW: 'w-24',
                            descW1: 'w-full',
                            descW2: 'w-3/4',
                            urlW: 'w-28',
                        },
                        {
                            nameW: 'w-20',
                            descW1: 'w-full',
                            descW2: 'w-5/6',
                            urlW: 'w-32',
                        },
                        {
                            nameW: 'w-24',
                            descW1: 'w-full',
                            descW2: 'w-4/5',
                            urlW: 'w-28',
                        },
                        {
                            nameW: 'w-28',
                            descW1: 'w-full',
                            descW2: 'w-2/3',
                            urlW: 'w-32',
                        },
                    ].map((item, idx) => (
                        <div
                            key={idx}
                            className="flex animate-pulse flex-col justify-between rounded-xl border border-line bg-paper/60 p-4"
                        >
                            <div>
                                <div className="flex items-start justify-between gap-2.5">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-xl bg-line/80 ring-1 ring-line" />
                                        <div>
                                            <div
                                                className={`h-4 ${item.nameW} rounded bg-line`}
                                            />
                                            <div className="mt-1.5 h-4 w-16 rounded-full bg-line/70" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-1.5">
                                    <div
                                        className={`h-3 ${item.descW1} rounded bg-line/70`}
                                    />
                                    <div
                                        className={`h-3 ${item.descW2} rounded bg-line/70`}
                                    />
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3">
                                <div
                                    className={`h-3 ${item.urlW} rounded bg-line/60 font-mono`}
                                />
                                <div className="h-7 w-18 rounded-lg bg-line/80 ring-1 ring-line" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
}
