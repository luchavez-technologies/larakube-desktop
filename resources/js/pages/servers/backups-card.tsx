import { Link, usePage } from '@inertiajs/react';
import { ArrowRight, DatabaseBackup, Play } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import ExperimentalBadge from '@/components/experimental-badge';
import { ListRow, TwoLine } from '@/components/list-row';
import StatusPill from '@/components/status-pill';
import { ago, describeSchedule, formatBytes } from '@/lib/backups';
import type { BackupStatus, Server, Untested } from '@/types/larakube';

function BackupsCardLabel() {
    const { untested } = usePage<{ untested: Untested }>().props;

    return (
        <span className="inline-flex items-center gap-1.5">
            Backups &amp; Disaster Recovery
            {untested.capabilities.includes('backups') && (
                <ExperimentalBadge compact />
            )}
        </span>
    );
}

export default function BackupsCard({
    server,
    backup,
    disabled,
}: {
    server: Server;
    backup?: BackupStatus | null;
    disabled?: boolean;
}) {
    const base = `/servers/${encodeURIComponent(server.name)}/backups`;

    if (backup === undefined) {
        return (
            <Card label={<BackupsCardLabel />}>
                <p className="py-3 text-sm text-soft">Checking backups…</p>
            </Card>
        );
    }

    if (backup === null) {
        return (
            <Card
                label={<BackupsCardLabel />}
                action={
                    <Link
                        href={base}
                        className={buttonClass('secondary', 'sm')}
                    >
                        <span>Open Backups</span>
                        <ArrowRight className="size-3.5" />
                    </Link>
                }
            >
                <p className="py-3 text-sm text-soft">
                    Couldn&rsquo;t read the backup status. Open the Backups
                    section to refresh and manage snapshots.
                </p>
            </Card>
        );
    }

    if (!backup.configured) {
        return (
            <Card
                label={<BackupsCardLabel />}
                action={<StatusPill tone="bad">Not backed up</StatusPill>}
            >
                <div className="flex flex-col items-start justify-between gap-4 py-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-paper text-faint ring-1 ring-line">
                            <DatabaseBackup className="size-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-ink">
                                Off-server encrypted backups are not set up
                            </p>
                            <p className="mt-0.5 text-xs text-soft">
                                Configure an S3 or Cloudflare R2 bucket in the
                                Backups &amp; Disaster Recovery section.
                            </p>
                        </div>
                    </div>
                    <Link href={base} className={buttonClass('primary', 'sm')}>
                        <DatabaseBackup className="size-3.5" />
                        <span>Set up Backups</span>
                        <ArrowRight className="size-3.5" />
                    </Link>
                </div>
            </Card>
        );
    }

    const schedule = backup.schedule;
    const last = backup.backups?.last ?? null;
    const entriesCount = backup.backups?.entries?.length ?? 0;

    return (
        <Card
            label={<BackupsCardLabel />}
            action={
                <div className="flex items-center gap-2">
                    {schedule?.scheduled && !schedule.suspended ? (
                        <StatusPill tone="ok">Scheduled</StatusPill>
                    ) : (
                        <StatusPill tone="muted">Manual Only</StatusPill>
                    )}
                    <Link
                        href={base}
                        className={buttonClass('secondary', 'sm')}
                    >
                        <span>Manage Backups</span>
                        <ArrowRight className="size-3.5" />
                    </Link>
                </div>
            }
        >
            <ListRow>
                <TwoLine
                    title="Destination"
                    detail={`${backup.destination?.bucket} · ${backup.destination?.endpoint}`}
                    mono
                />
            </ListRow>
            <ListRow>
                <TwoLine
                    title="Schedule"
                    detail={
                        schedule?.scheduled
                            ? describeSchedule(schedule.cron, schedule.timezone)
                            : 'Backups run manually when triggered.'
                    }
                />
            </ListRow>
            <ListRow
                action={
                    <Link
                        href={`${base}/run`}
                        method="post"
                        as="button"
                        disabled={disabled}
                        className={buttonClass('secondary', 'sm')}
                    >
                        <Play className="size-3.5" />
                        <span>Back up now</span>
                    </Link>
                }
            >
                <TwoLine
                    title={`Latest snapshot (${entriesCount} total)`}
                    detail={
                        last
                            ? `${ago(last.taken)} · ${formatBytes(last.bytes)}`
                            : 'None taken yet'
                    }
                />
            </ListRow>
        </Card>
    );
}
