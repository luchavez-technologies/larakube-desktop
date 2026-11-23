import { Deferred, Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import {
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    Laptop,
    RotateCw,
    Sparkles,
    Square,
    TriangleAlert,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import ConfirmModal from '@/components/confirm-modal';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import LiveDot from '@/components/live-dot';
import LocalDevCompanionsCard, {
    LocalDevCompanionsCardSkeleton,
} from '@/components/local-dev-companions-card';
import PageHeader from '@/components/page-header';
import { cn } from '@/lib/utils';
import {
    NativeEvents,
    useNativeEventReload,
    useRunReload,
} from '@/lib/native-events';
import { prune } from '@/routes/local/certificates';
import { refresh as refreshHealth } from '@/routes/local/health';
import { index as projectsIndex, stopAll } from '@/routes/projects';
import type {
    CompanionApp,
    LocalProjectStatus,
    NodeMetrics,
} from '@/types/larakube';

type LocalHealthReport = {
    checked: boolean;
    issues: { title: string; description: string; fix: string | null }[];
};

type LocalProject = {
    id: number;
    name: string;
    framework: string | null;
    database: string | null;
    cacheDriver: string | null;
    domain: string | null;
    localStatus: LocalProjectStatus;
    liveReload: {
        enabled: boolean;
        status: string;
        targets: string[];
        lastReloadAt: string | null;
    };
};

type HealthIssue = LocalHealthReport['issues'][number];

/** A fix that is an actual command to paste, not advice like "run X (in that project)". */
function runnableFix(fix: string | null): string | null {
    const command = (fix ?? '').replace(/^Run: /, '').trim();

    return /^larakube [\w:-]+(\s+[\w:=./-]+)*$/.test(command) ? command : null;
}

/** Issues of one kind together ("App certs" for twelve hosts is one row). */
function groupIssues(
    issues: HealthIssue[],
): { title: string; issues: HealthIssue[]; fix: string | null }[] {
    const groups = new Map<string, HealthIssue[]>();
    for (const issue of issues) {
        groups.set(issue.title, [...(groups.get(issue.title) ?? []), issue]);
    }

    return [...groups.entries()].map(([title, grouped]) => {
        const fixes = new Set(grouped.map((issue) => issue.fix ?? ''));

        return {
            title,
            issues: grouped,
            fix: fixes.size === 1 ? (grouped[0].fix ?? null) : null,
        };
    });
}

function HealthGroup({
    title,
    issues,
    fix,
}: {
    title: string;
    issues: HealthIssue[];
    fix: string | null;
}) {
    const [open, setOpen] = useState(false);
    const single = issues.length === 1;
    const command = runnableFix(fix);
    const advice = fix?.replace(/^Run: /, '') ?? null;

    return (
        <li className="py-2.5 first:pt-0 last:pb-0">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                disabled={single}
                aria-expanded={open}
                className="flex w-full cursor-pointer items-start gap-2.5 text-left disabled:cursor-default"
            >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        {title}
                        {!single && (
                            <span className="rounded-full bg-warn/15 px-1.5 text-[11px] font-semibold text-warn">
                                {issues.length}
                            </span>
                        )}
                    </span>
                    <span className="mt-0.5 block text-xs text-soft">
                        {single
                            ? issues[0].description.replace(/^✗ /, '')
                            : `${issues.length} affected. ${open ? 'Hide' : 'Show'} which.`}
                    </span>
                </span>
                {!single && (
                    <ChevronDown
                        className={cn(
                            'mt-1 size-3.5 shrink-0 text-soft transition',
                            open && 'rotate-180',
                        )}
                    />
                )}
            </button>

            {open && !single && (
                <ul className="mt-2 ml-6.5 space-y-0.5 font-mono text-[11px] text-soft">
                    {issues.map((issue, index) => (
                        <li key={index} className="truncate">
                            {issue.description
                                .replace(/^✗ /, '')
                                .replace(/ — run: .*$/, '')}
                        </li>
                    ))}
                </ul>
            )}

            {command === 'larakube trust:prune' && <PruneCertificates />}

            {advice && command !== 'larakube trust:prune' && (
                <div className="mt-1.5 ml-6.5 flex items-center gap-1.5 text-xs text-soft">
                    <span>Fix:</span>
                    {command ? (
                        <>
                            <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink">
                                {command}
                            </code>
                            <CopyButton
                                value={command}
                                label=""
                                copiedLabel=""
                                size="xs"
                                variant="ghost"
                                title="Copy the command"
                            />
                        </>
                    ) : (
                        <span>{advice}</span>
                    )}
                </div>
            )}
        </li>
    );
}

/** Removes local certificates nothing serves (`trust:prune`), after saying they come back on demand. */
function PruneCertificates() {
    const [open, setOpen] = useState(false);

    return (
        <div className="mt-2 ml-6.5">
            <Button
                variant="secondary"
                size="sm"
                onClick={() => setOpen(true)}
                title="larakube trust:prune"
            >
                <Sparkles className="size-3.5" />
                <span>Clean up unused certificates</span>
            </Button>
            <ConfirmModal
                isOpen={open}
                onClose={() => setOpen(false)}
                onConfirm={() => {
                    setOpen(false);
                    router.post(prune().url, {}, { preserveScroll: true });
                }}
                tone="brand"
                title="Clean up unused local certificates?"
                confirmLabel="Clean up"
                confirmIcon={<Sparkles className="size-4" />}
                description="Removes the local certificates no app on your local cluster serves any more: old and deleted projects, removed apps, and ones from an old TLD."
                notice="Nothing running is affected. LaraKube issues a certificate again when its app is installed or `up` runs."
            />
        </div>
    );
}

function HealthCard({ health }: { health?: LocalHealthReport }) {
    const action = (
        <Link
            href={refreshHealth().url}
            method="post"
            as="button"
            preserveScroll
            className={buttonClass('ghost', 'sm', 'gap-1 text-soft')}
            title="Check again"
        >
            <RotateCw className="size-3.5" />
            <span>Check again</span>
        </Link>
    );

    if (health === undefined) {
        return (
            <Card label="Health" action={action}>
                <div className="h-10 animate-pulse rounded-xl bg-paper" />
            </Card>
        );
    }

    if (!health.checked) {
        return (
            <Card label="Health" action={action}>
                <p className="text-xs text-soft">
                    Could not run the checks. Is the LaraKube CLI installed?
                </p>
            </Card>
        );
    }

    if (health.issues.length === 0) {
        return (
            <Card label="Health" action={action}>
                <p className="flex items-center gap-2 text-sm text-ink">
                    <CheckCircle2 className="size-4 text-ok" />
                    All good: container runtime, local cluster, Traefik, and the
                    Local CA and DNS for your local domains.
                </p>
            </Card>
        );
    }

    return (
        <Card label="Health" tone="warn" action={action}>
            <ul className="divide-y divide-warn-line/60">
                {groupIssues(health.issues).map((group) => (
                    <HealthGroup key={group.title} {...group} />
                ))}
            </ul>
        </Card>
    );
}

function Meter({
    label,
    percent,
    detail,
}: {
    label: string;
    percent: number | null;
    detail: string | null;
}) {
    const value = percent ?? 0;

    return (
        <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-soft">{label}</span>
                <span className="font-mono text-ink">
                    {percent !== null ? `${percent}%` : '—'}
                </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper ring-1 ring-line/60">
                <div
                    className={cn(
                        'h-full rounded-full transition-all',
                        value >= 85
                            ? 'bg-accent'
                            : value >= 65
                              ? 'bg-warn'
                              : 'bg-ok',
                    )}
                    style={{ width: `${Math.min(100, value)}%` }}
                />
            </div>
            {detail && (
                <p className="mt-1 font-mono text-[10px] text-faint">
                    {detail}
                </p>
            )}
        </div>
    );
}

/**
 * This machine's cluster at a glance: what it is, how loaded it is, and what
 * runs on it. The projects themselves are on the Projects page.
 */
function LocalClusterCard({
    engine,
    metrics,
    projects,
}: {
    engine: { engine: string; status: string; tone: string };
    metrics?: NodeMetrics | null;
    projects: LocalProject[];
}) {
    const count = (state: string) =>
        projects.filter((project) => project.localStatus.state === state)
            .length;
    const running = count('running');
    const paused = count('paused');
    const watching = projects.filter(
        (project) =>
            project.liveReload.enabled &&
            project.liveReload.status === 'watching',
    ).length;

    return (
        <Card
            label="Local cluster"
            action={
                running + paused > 0 && (
                    <Link
                        href={stopAll().url}
                        method="post"
                        as="button"
                        preserveScroll
                        className={buttonClass('secondary', 'sm', 'gap-1')}
                        title="Pause every local project to free memory (larakube stop)"
                    >
                        <Square className="size-3" />
                        <span>Stop all</span>
                    </Link>
                )
            }
        >
            <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-teal-600/10 text-teal-600 ring-1 ring-teal-600/20">
                    <Laptop className="size-5" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                        {engine.engine}
                    </p>
                    <p className="text-xs text-soft">{engine.status}</p>
                </div>
            </div>

            {metrics === undefined ? (
                <div className="mt-4 h-10 animate-pulse rounded-xl bg-paper" />
            ) : metrics?.available ? (
                <div className="mt-4 flex gap-4">
                    <Meter
                        label="CPU"
                        percent={metrics.cpuPercent}
                        detail={metrics.cpuUsage}
                    />
                    <Meter
                        label="Memory"
                        percent={metrics.memoryPercent}
                        detail={metrics.memoryUsage}
                    />
                </div>
            ) : (
                <p className="mt-4 text-xs text-soft">
                    Usage is unavailable: the cluster's metrics server is not
                    answering.
                </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line/60 pt-3 text-xs text-soft">
                <Link
                    href={projectsIndex().url}
                    className="inline-flex items-center gap-1.5 hover:text-ink"
                >
                    <span className="font-semibold text-ink">{running}</span>{' '}
                    running
                    {paused > 0 && (
                        <>
                            {' · '}
                            <span className="font-semibold text-ink">
                                {paused}
                            </span>{' '}
                            paused
                        </>
                    )}
                    <ArrowRight className="size-3" />
                </Link>
                {watching > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                        <LiveDot size="sm" />
                        Live reload on {watching}
                    </span>
                )}
                {metrics?.available && metrics.pvcCount > 0 && (
                    <span>
                        {metrics.pvcCount} volumes
                        {metrics.pvcCapacity ? ` · ${metrics.pvcCapacity}` : ''}
                    </span>
                )}
            </div>
        </Card>
    );
}

export default function LocalIndex({
    localTld,
    engine,
    projects,
    health,
    metrics,
    companions,
}: {
    localTld: string;
    engine: { engine: string; status: string; tone: string };
    projects: LocalProject[];
    health?: LocalHealthReport;
    metrics?: NodeMetrics | null;
    companions?: CompanionApp[] | null;
}) {
    useRunReload(['projects', 'companions'], () => true);
    useNativeEventReload(NativeEvents.localWorkloadsSynced, ['projects']);

    return (
        <>
            <Head title="Local Dev" />
            <PageHeader
                title="Local Dev"
                subtitle={`Your machine's cluster: what runs on it, the dev tools every project shares, and whether *.${localTld} works.`}
                badge={
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-soft ring-1 ring-line">
                        <Laptop className="size-3 text-brand" />
                        {engine.engine}
                    </span>
                }
            />

            <div className="space-y-6">
                <div className="grid items-start gap-6 lg:grid-cols-2">
                    <Deferred
                        data="health"
                        fallback={
                            <LocalClusterCard
                                engine={engine}
                                projects={projects}
                            />
                        }
                    >
                        <LocalClusterCard
                            engine={engine}
                            metrics={metrics}
                            projects={projects}
                        />
                    </Deferred>
                    <Deferred
                        data="health"
                        fallback={<HealthCard health={undefined} />}
                    >
                        <HealthCard health={health} />
                    </Deferred>
                </div>

                <Deferred
                    data="companions"
                    fallback={
                        <LocalDevCompanionsCardSkeleton localTld={localTld} />
                    }
                >
                    <LocalDevCompanionsCard
                        projects={projects}
                        companions={companions}
                        localTld={localTld}
                    />
                </Deferred>
            </div>
        </>
    );
}
