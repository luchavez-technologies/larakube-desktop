import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    ArrowUpCircle,
    Check,
    ChevronDown,
    ChevronRight,
    RotateCw,
    Trash2,
    X,
    XCircle,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import WslCheck, { type WslState } from '@/components/setup/wsl-check';
import { sendJson } from '@/lib/http';
import { forgetToolStatus } from '@/lib/tool-status';
import { cn } from '@/lib/utils';

type UpdatesDiagnosticsTabProps = {
    windows?: boolean;
    wsl?: WslState | null;
};

type UpdateStatus = {
    enabled: boolean;
    version: string;
    state: 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error';
    latest: string | null;
    percent: number;
    message: string | null;
};

function xsrf(): string {
    return decodeURIComponent(
        document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '',
    );
}

async function updatesCall(path: string, method: 'GET' | 'POST') {
    const response = await fetch(path, {
        method,
        headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() },
    });

    return response.ok ? ((await response.json()) as UpdateStatus) : null;
}

export default function UpdatesDiagnosticsTab({
    windows = false,
    wsl = null,
}: UpdatesDiagnosticsTabProps) {
    return (
        <div className="space-y-5">
            <UpdatesCard />
            <DiagnosticsCard />
            {windows && wsl?.state === 'stale' && <WslCheck wsl={wsl} />}
            {windows && wsl?.state === 'ready' && <LinuxCard />}
        </div>
    );
}

function UpdatesCard() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const busy =
        status?.state === 'checking' || status?.state === 'downloading';

    useEffect(() => {
        let alive = true;
        const load = () =>
            updatesCall('/updates', 'GET').then(
                (next) => alive && setStatus(next),
            );

        void load();
        const timer = setInterval(load, busy ? 1500 : 10000);

        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [busy]);

    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            window.location.search.includes('action=updates')
        ) {
            void updatesCall('/updates/check', 'POST').then((next) => {
                if (next) setStatus(next);
            });
            const el = document.getElementById('app-updates-card');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, []);

    if (!status) {
        return null;
    }

    const line = !status.enabled
        ? 'Updates are off in this build.'
        : status.state === 'checking'
          ? 'Checking for updates…'
          : status.state === 'downloading'
            ? `Downloading ${status.latest ?? 'the update'}… ${status.percent}%`
            : status.state === 'ready'
              ? `${status.latest} is ready. Restart to finish updating.`
              : status.state === 'current'
                ? 'You have the latest version.'
                : status.state === 'error'
                  ? `The update check failed: ${status.message}`
                  : 'LaraKube Desktop also checks each time it opens.';

    return (
        <div id="app-updates-card">
            <Card
                label="App updates"
                action={
                    status.enabled ? (
                        status.state === 'ready' ? (
                            <Button
                                type="button"
                                onClick={() =>
                                    updatesCall('/updates/install', 'POST')
                                }
                            >
                                <ArrowUpCircle className="size-4" />
                                Restart to update
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                    updatesCall('/updates/check', 'POST').then(
                                        setStatus,
                                    )
                                }
                            >
                                <RotateCw
                                    className={cn(
                                        'size-4',
                                        busy && 'animate-spin',
                                    )}
                                />
                                Check for updates
                            </Button>
                        )
                    ) : undefined
                }
            >
                <p className="text-sm">
                    <span className="font-medium">
                        Version {status.version}
                    </span>
                    <span className="text-soft"> · {line}</span>
                </p>
            </Card>
        </div>
    );
}

function LinuxCard() {
    const [confirming, setConfirming] = useState(false);
    const [working, setWorking] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dangerOpen, setDangerOpen] = useState(false);

    const update = async () => {
        setUpdating(true);
        setError(null);
        setUpdateSuccess(null);

        const result = await fetch('/setup/wsl/update', {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() },
        })
            .then(
                (response) =>
                    response.json() as Promise<{
                        ok: boolean;
                        message: string;
                    }>,
            )
            .catch(() => ({
                ok: false,
                message: 'LaraKube Desktop could not reach itself. Try again.',
            }));

        setUpdating(false);

        if (!result.ok) {
            setError(result.message);

            return;
        }

        setUpdateSuccess(result.message);
        forgetToolStatus();
    };

    const reset = async () => {
        setWorking(true);
        setError(null);
        setUpdateSuccess(null);

        const result = await fetch('/setup/wsl/reset', {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() },
        })
            .then(
                (response) =>
                    response.json() as Promise<{
                        ok: boolean;
                        message: string;
                    }>,
            )
            .catch(() => ({
                ok: false,
                message: 'LaraKube Desktop could not reach itself. Try again.',
            }));

        setWorking(false);

        if (!result.ok) {
            setError(result.message);

            return;
        }

        forgetToolStatus();
        router.visit('/readiness');
    };

    return (
        <Card label="LaraKube Linux">
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 text-sm">
                    <div>
                        <p className="font-medium text-ink">
                            Distro & Toolchain Update
                        </p>
                        <p className="mt-0.5 text-xs text-soft">
                            Updates the LaraKube CLI and cloud tools inside your
                            WSL distro. Preserves all your projects and dotfiles
                            in{' '}
                            <code className="font-mono text-ink">
                                /home/larakube
                            </code>
                            .
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={updating || working}
                        onClick={() => void update()}
                    >
                        <RotateCw
                            className={cn(
                                'size-3.5',
                                updating && 'animate-spin',
                            )}
                        />
                        <span>
                            {updating ? 'Updating…' : 'Update LaraKube Linux'}
                        </span>
                    </Button>
                </div>

                {updateSuccess && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3.5" />
                        <span>{updateSuccess}</span>
                    </div>
                )}

                {error && !confirming && (
                    <p className="text-xs text-accent">{error}</p>
                )}

                {/* Collapsible Danger Zone */}
                <div className="border-t border-line/70 pt-3.5">
                    <button
                        type="button"
                        onClick={() => setDangerOpen(!dangerOpen)}
                        className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-soft transition-colors hover:text-ink"
                    >
                        {dangerOpen ? (
                            <ChevronDown className="size-3.5" />
                        ) : (
                            <ChevronRight className="size-3.5" />
                        )}
                        <span>Danger Zone (Factory Reset)</span>
                    </button>

                    {dangerOpen && (
                        <div className="mt-3 rounded-xl border border-accent/20 bg-accent/[0.03] p-4 text-sm">
                            {confirming ? (
                                <div className="space-y-3">
                                    <div className="flex items-start gap-2 text-accent">
                                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                        <div>
                                            <p className="text-xs font-semibold">
                                                Factory Reset Confirmation
                                            </p>
                                            <p className="mt-1 text-xs text-soft">
                                                This deletes the{' '}
                                                <code className="font-mono text-ink">
                                                    larakube-ubuntu
                                                </code>{' '}
                                                WSL distro. As a safety
                                                guarantee, your projects will
                                                automatically be backed up to
                                                your Windows{' '}
                                                <code className="font-mono text-ink">
                                                    %LOCALAPPDATA%\LaraKube\backups\
                                                </code>{' '}
                                                directory before unregistering.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <Button
                                            type="button"
                                            variant="danger"
                                            disabled={working}
                                            onClick={() => void reset()}
                                        >
                                            <Trash2 className="size-3.5" />
                                            <span>
                                                {working
                                                    ? 'Resetting…'
                                                    : 'Delete and reset'}
                                            </span>
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            disabled={working}
                                            onClick={() => {
                                                setConfirming(false);
                                                setError(null);
                                            }}
                                        >
                                            <XCircle className="size-3.5" />
                                            <span>Cancel</span>
                                        </Button>
                                    </div>
                                    {error && (
                                        <p className="text-xs text-accent">
                                            {error}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold text-ink">
                                            Reset LaraKube Linux
                                        </p>
                                        <p className="mt-0.5 text-xs text-soft">
                                            Completely unregisters the distro to
                                            start over fresh. Automatically
                                            backs up existing projects first.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => setConfirming(true)}
                                    >
                                        <Trash2 className="size-3.5 text-accent" />
                                        <span>Reset LaraKube Linux…</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

function DiagnosticsCard() {
    const [report, setReport] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        const result = await sendJson<{ report: string }>(
            '/diagnostics',
            'GET',
        );
        setReport(
            result.ok
                ? result.data.report
                : 'Could not gather the details. Try again.',
        );
        setLoading(false);
    };

    return (
        <Card
            label="Diagnostics"
            action={
                report ? (
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                void sendJson('/diagnostics/folder', 'POST')
                            }
                        >
                            Show log folder
                        </Button>
                        <CopyButton value={report} />
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setReport(null)}
                        >
                            <X className="size-3.5" />
                            Close
                        </Button>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        {loading ? 'Gathering…' : 'Show diagnostics'}
                    </Button>
                )
            }
        >
            {report ? (
                <pre className="max-h-80 overflow-auto rounded-lg bg-term px-3 py-2 font-mono text-xs whitespace-pre-wrap text-term-bright">
                    {report}
                </pre>
            ) : (
                <p className="text-sm text-soft">
                    The details someone needs to help with a problem: versions,
                    LaraKube Linux, the CLI, the last failed runs and the end of
                    the app log. Passwords and tokens are removed.
                </p>
            )}
        </Card>
    );
}
