import { Link } from '@inertiajs/react';
import { Database, Layers, Pause, Play } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import { ListRow, TwoLine } from '@/components/list-row';
import StatusPill from '@/components/status-pill';
import type { PlexStatus, Server } from '@/types/larakube';

export function CheckingRow({ title }: { title: string }) {
    return (
        <ListRow action={<StatusPill tone="muted">Checking…</StatusPill>}>
            <TwoLine title={title} detail="Asking the server." />
        </ListRow>
    );
}

export default function PlexCommonsCard({
    server,
    plex,
    disabled,
}: {
    server: Server;
    plex?: PlexStatus | null;
    disabled?: boolean;
}) {
    if (plex === undefined) {
        return <CheckingRow title="Checking Plex Commons…" />;
    }

    const initialized = Boolean(plex?.initialized);
    // Flattened for this card's simple pill list — Phase 4 of the Plex
    // Commons Desktop page gives the tool/project/custom split its own
    // dedicated table instead of folding it back into one list.
    const tenants = [
        ...(plex?.tenants?.tool ?? []),
        ...(plex?.tenants?.project ?? []),
        ...(plex?.tenants?.custom ?? []),
    ];
    const tenantCount = tenants.length;

    return (
        <Card
            label="Plex Commons"
            action={
                <div className="flex items-center gap-2">
                    {initialized ? (
                        <StatusPill tone="ok">Active</StatusPill>
                    ) : (
                        <StatusPill tone="muted">Not initialized</StatusPill>
                    )}
                    {initialized && (
                        <>
                            <Link
                                href={`/servers/${server.name}/plex/stop`}
                                method="post"
                                as="button"
                                className={buttonClass(
                                    'ghost',
                                    'sm',
                                    'gap-1 text-soft',
                                )}
                                title="Pause Commons to stop background pods"
                            >
                                <Pause className="size-3" />
                                <span>Pause</span>
                            </Link>
                            <Link
                                href={`/servers/${server.name}/plex/start`}
                                method="post"
                                as="button"
                                className={buttonClass(
                                    'secondary',
                                    'sm',
                                    'gap-1',
                                )}
                                title="Resume Commons pods"
                            >
                                <Play className="size-3" />
                                <span>Resume</span>
                            </Link>
                        </>
                    )}
                </div>
            }
        >
            {!initialized ? (
                <div className="py-4 text-center">
                    <Layers className="mx-auto mb-2 size-7 text-faint" />
                    <p className="text-sm font-medium text-ink">
                        Shared Commons Infrastructure
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-soft">
                        Shared PostgreSQL, Redis, and MinIO S3 storage for
                        tenant apps and static sites. Saves cluster memory and
                        avoids duplicate database pods.
                    </p>
                    <div className="mt-4 flex justify-center">
                        <Link
                            href={`/servers/${server.name}/plex/init`}
                            method="post"
                            as="button"
                            disabled={disabled}
                            className={buttonClass('tools', 'sm', 'gap-1.5')}
                        >
                            <Layers className="size-3.5" />
                            <span>Initialize Plex Commons</span>
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <p className="mb-2 text-xs font-medium text-soft">
                            Core Services
                        </p>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            <div className="rounded-lg bg-paper p-2.5 ring-1 ring-line">
                                <div className="flex items-center gap-2">
                                    <Database className="size-3.5 text-brand" />
                                    <span className="text-xs font-semibold text-ink">
                                        PostgreSQL
                                    </span>
                                </div>
                                <p className="mt-1 truncate font-mono text-[10px] text-soft">
                                    postgres.larakube-plex:5432
                                </p>
                            </div>
                            <div className="rounded-lg bg-paper p-2.5 ring-1 ring-line">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs">⚡</span>
                                    <span className="text-xs font-semibold text-ink">
                                        Redis
                                    </span>
                                </div>
                                <p className="mt-1 truncate font-mono text-[10px] text-soft">
                                    redis.larakube-plex:6379
                                </p>
                            </div>
                            <div className="rounded-lg bg-paper p-2.5 ring-1 ring-line">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs">☁️</span>
                                    <span className="text-xs font-semibold text-ink">
                                        MinIO S3
                                    </span>
                                </div>
                                <p className="mt-1 truncate font-mono text-[10px] text-soft">
                                    minio.larakube-plex:9000
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-line/60 pt-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-soft">
                                Connected Tenants ({tenantCount})
                            </span>
                        </div>
                        {tenantCount === 0 ? (
                            <p className="text-xs text-soft">
                                No apps have joined this server's Commons yet.
                                Projects can join from their project dashboard.
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {tenants.map((tenant) => (
                                    <span
                                        key={tenant.name}
                                        className="inline-flex items-center gap-1.5 rounded-md bg-paper px-2.5 py-1 text-xs font-medium ring-1 ring-line"
                                    >
                                        <span className="font-mono text-ink">
                                            {tenant.name}
                                        </span>
                                        {tenant.redisIndex !== null && (
                                            <span className="text-[10px] text-soft">
                                                (DB {tenant.redisIndex})
                                            </span>
                                        )}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}
