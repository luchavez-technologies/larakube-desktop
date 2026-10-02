import { Form, Link } from '@inertiajs/react';
import { useState } from 'react';
import { AlertCircle, DatabaseBackup, FolderOpen } from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import { ListRow, TwoLine } from '@/components/list-row';
import StatusPill from '@/components/status-pill';
import { SCHEDULES, ago, describeSchedule, formatBytes } from '@/lib/backups';
import type { BackupEntry, BackupStatus, Server } from '@/types/larakube';

type Dialog = 'setup' | 'schedule' | 'prune' | { restore: BackupEntry } | null;

const field =
    'w-full rounded-lg border-0 px-3 py-2 text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-brand';

function cardKey(server: string): string {
    return `larakube.recovery-card-saved.${server}`;
}

function cardSaved(server: string): boolean {
    try {
        return window.localStorage.getItem(cardKey(server)) === '1';
    } catch {
        return false;
    }
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
    const [dialog, setDialog] = useState<Dialog>(null);
    const [saved, setSaved] = useState(() => cardSaved(server.name));
    const base = `/servers/${server.name}/backups`;

    if (backup === undefined) {
        return (
            <Card label="Backups">
                <p className="py-3 text-sm text-soft">Checking backups…</p>
            </Card>
        );
    }

    if (backup === null) {
        return (
            <Card label="Backups">
                <p className="py-3 text-sm text-soft">
                    Couldn't read the backup status. Check that the server is
                    reachable and that the LaraKube CLI is up to date, then
                    press Check again.
                </p>
            </Card>
        );
    }

    if (!backup.configured) {
        return (
            <>
                <Card
                    label="Backups"
                    action={<StatusPill tone="bad">Not backed up</StatusPill>}
                >
                    <div className="py-4 text-center">
                        <DatabaseBackup className="mx-auto mb-2 size-7 text-faint" />
                        <p className="text-sm font-medium text-ink">
                            This server has no backups
                        </p>
                        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-soft">
                            Your chat, wiki and passwords live only on this
                            server. Backups copy them, encrypted, to a bucket
                            somewhere else, so you can get them back if the
                            server is lost.
                        </p>
                        <div className="mt-4 flex justify-center">
                            <Button
                                disabled={disabled}
                                onClick={() => setDialog('setup')}
                            >
                                Set up backups
                            </Button>
                        </div>
                    </div>
                </Card>
                {dialog === 'setup' && (
                    <SetupDialog
                        base={base}
                        server={server}
                        onClose={() => setDialog(null)}
                    />
                )}
            </>
        );
    }

    const schedule = backup.schedule;
    const last = backup.backups?.last ?? null;
    const entries = backup.backups?.entries ?? [];
    const incomplete = backup.backups?.incomplete ?? 0;
    const needsCard = !saved && backup.recoveryCard?.exists !== false;

    return (
        <>
            <Card
                label="Backups"
                action={
                    needsCard ? (
                        <StatusPill tone="bad">Action needed</StatusPill>
                    ) : schedule?.scheduled && !schedule.suspended ? (
                        <StatusPill tone="ok">Scheduled</StatusPill>
                    ) : (
                        <StatusPill tone="muted">Not scheduled</StatusPill>
                    )
                }
            >
                {needsCard && (
                    <div className="mb-3 rounded-lg bg-warn-tint p-3 ring-1 ring-warn-line">
                        <p className="flex items-center gap-2 text-sm font-medium text-ink">
                            <AlertCircle className="size-4 text-warn" />
                            Save your recovery card
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-soft">
                            It holds the passphrase that unlocks your backups.
                            Without it they cannot be read, and it is not kept
                            on the server. Keep a copy somewhere that is not
                            this computer and not this server, such as a
                            password manager on another device.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <Link
                                href={`${base}/recovery-card`}
                                method="post"
                                as="button"
                                className={buttonClass(
                                    'secondary',
                                    'sm',
                                    'gap-1.5',
                                )}
                            >
                                <FolderOpen className="size-3.5" />
                                Show the file
                            </Link>
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                                <input
                                    type="checkbox"
                                    onChange={(event) => {
                                        try {
                                            window.localStorage.setItem(
                                                cardKey(server.name),
                                                event.target.checked
                                                    ? '1'
                                                    : '0',
                                            );
                                        } catch {
                                            // Not remembering it is harmless: the box shows again.
                                        }
                                        setSaved(event.target.checked);
                                    }}
                                />
                                I saved a copy somewhere else
                            </label>
                        </div>
                    </div>
                )}

                <ListRow>
                    <TwoLine
                        title="Destination"
                        detail={`${backup.destination?.bucket} · ${backup.destination?.endpoint}`}
                        mono
                    />
                </ListRow>
                <ListRow
                    action={
                        schedule?.scheduled ? (
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDialog('schedule')}
                                >
                                    Change
                                </Button>
                                <Link
                                    href={`${base}/unschedule`}
                                    method="post"
                                    as="button"
                                    className={buttonClass(
                                        'ghost',
                                        'sm',
                                        'text-soft',
                                    )}
                                >
                                    Stop
                                </Link>
                            </div>
                        ) : (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDialog('schedule')}
                            >
                                Schedule
                            </Button>
                        )
                    }
                >
                    <TwoLine
                        title="Schedule"
                        detail={
                            schedule?.scheduled
                                ? describeSchedule(
                                      schedule.cron,
                                      schedule.timezone,
                                  )
                                : 'Backups only run when you press Back up now.'
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
                            Back up now
                        </Link>
                    }
                >
                    <TwoLine
                        title="Latest backup"
                        detail={
                            backup.backups?.available === false
                                ? 'Install the AWS CLI in Setup to see backups.'
                                : last
                                  ? `${ago(last.taken)} · ${formatBytes(last.bytes)}`
                                  : 'None yet'
                        }
                    />
                </ListRow>

                {entries.length > 0 && (
                    <div className="mt-3 border-t border-line/60 pt-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-soft">
                                Backups ({entries.length})
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDialog('prune')}
                            >
                                Clean up old backups
                            </Button>
                        </div>
                        <div className="space-y-1.5">
                            {entries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2 ring-1 ring-line"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-mono text-xs text-ink">
                                            {entry.taken}
                                        </p>
                                        <p className="text-[11px] text-soft">
                                            {formatBytes(entry.bytes)} ·{' '}
                                            {entry.items} items
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <Form
                                            action={`${base}/check`}
                                            method="post"
                                        >
                                            <input
                                                type="hidden"
                                                name="backup"
                                                value={entry.id}
                                            />
                                            <Button
                                                type="submit"
                                                variant="ghost"
                                                size="sm"
                                            >
                                                Check
                                            </Button>
                                        </Form>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-accent"
                                            onClick={() =>
                                                setDialog({ restore: entry })
                                            }
                                        >
                                            Restore…
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {incomplete > 0 && (
                            <p className="mt-2 text-[11px] text-soft">
                                {incomplete} unfinished backup
                                {incomplete === 1 ? '' : 's'} at the destination
                                can be removed by cleaning up.
                            </p>
                        )}
                    </div>
                )}
            </Card>

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
    children: React.ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
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
    children: React.ReactNode;
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
                            <Button variant="secondary" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {processing ? 'Starting…' : 'Set up backups'}
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
                            <Button variant="secondary" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {processing ? 'Saving…' : 'Save schedule'}
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
                        Preview what would be removed
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
                        Remove old backups
                    </Button>
                </Form>
                <div className="flex justify-end">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
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
            intro={`This replaces live data with the copy taken ${entry.taken}. A volume's service is stopped while it is restored. Press Check on the backup first if you have not.`}
        >
            <Form
                action={`${base}/restore`}
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
                            <Button variant="secondary" onClick={onClose}>
                                Cancel
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
                                {processing ? 'Starting…' : 'Restore'}
                            </Button>
                        </div>
                    </>
                )}
            </Form>
        </Modal>
    );
}
