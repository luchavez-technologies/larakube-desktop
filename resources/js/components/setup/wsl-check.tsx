import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowUpCircle,
    Check,
    Download,
    Power,
    RefreshCw,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { forgetToolStatus } from '@/lib/tool-status';
import { cn } from '@/lib/utils';

export type WslState = {
    state:
        | 'ready'
        | 'missing'
        | 'no-distro'
        | 'old-version'
        | 'broken'
        | 'stale';
    distro: string | null;
    version: number | null;
    message: string;
    command: string | null;
};

export type DownloadProgress = {
    total: number;
    downloaded: number;
    percent: number;
    formatted: string | null;
};

type WslStep =
    | 'enable'
    | 'download'
    | 'import'
    | 'backup'
    | 'reset'
    | 'restore';

const WSL_STEP_LABELS: Record<WslStep, string> = {
    enable: 'Turning on Windows Subsystem for Linux',
    download: 'Downloading LaraKube Linux',
    import: 'Installing LaraKube Linux',
    backup: 'Backing up your projects',
    reset: 'Removing the older LaraKube Linux',
    restore: 'Restoring your projects',
};

const WSL_STEP_SHORT_LABELS: Record<WslStep, string> = {
    enable: 'Enable WSL',
    download: 'Download',
    import: 'Install',
    backup: 'Backup',
    reset: 'Reset',
    restore: 'Restore',
};

const WSL_STEP_DESCRIPTIONS: Record<WslStep, string> = {
    enable: 'Asking Windows for permission to enable WSL…',
    download:
        'Downloading rootfs image with pre-installed Kubernetes & cloud tools (~300 MB)…',
    import: 'Unpacking and registering LaraKube Linux with WSL2. This usually takes 1 to 2 minutes on Windows.',
    backup: 'Creating a safety backup of your projects folder…',
    reset: 'Removing the older LaraKube Linux distribution…',
    restore: 'Restoring your projects back into LaraKube Linux…',
};

async function runWslStep(step: WslStep, body?: Record<string, string>) {
    const token = decodeURIComponent(
        document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)?.[1] ?? '',
    );
    const response = await fetch(`/setup/wsl/${step}`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': token,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    return (await response.json()) as {
        ok: boolean;
        message: string;
        path?: string;
    };
}

export default function WslCheck({ wsl }: { wsl?: WslState | null }) {
    const [working, setWorking] = useState<WslStep | null>(null);
    const [downloadProgress, setDownloadProgress] =
        useState<DownloadProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [restart, setRestart] = useState(false);

    useEffect(() => {
        if (working !== 'download') {
            setDownloadProgress(null);

            return;
        }

        let active = true;

        const poll = async () => {
            try {
                const response = await fetch('/setup/wsl/progress', {
                    headers: { Accept: 'application/json' },
                });
                if (response.ok && active) {
                    const data = (await response.json()) as DownloadProgress;
                    if (active) {
                        setDownloadProgress(data);
                    }
                }
            } catch {
                // Ignore polling errors
            }
        };

        void poll();
        const interval = setInterval(() => void poll(), 400);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [working]);

    if (!wsl) {
        return (
            <Card label="LaraKube Linux">
                <p className="flex items-center gap-2 py-3 text-sm text-soft">
                    <RefreshCw className="size-4 animate-spin" />
                    Checking LaraKube Linux…
                </p>
            </Card>
        );
    }

    const run = async (steps: WslStep[]) => {
        setError(null);
        let backupPath: string | undefined;

        for (const step of steps) {
            setWorking(step);
            // restore needs the path backup just produced a few steps earlier
            // in this same run — never a path from anywhere else.
            const body =
                step === 'restore' && backupPath
                    ? { path: backupPath }
                    : undefined;
            const result = await runWslStep(step, body).catch(() => ({
                ok: false,
                message: 'LaraKube Desktop could not reach itself. Try again.',
                path: undefined,
            }));

            if (!result.ok) {
                setWorking(null);
                setError(result.message);

                return;
            }

            if (step === 'backup' && result.path) {
                backupPath = result.path;
            }
        }

        setWorking(null);

        if (steps[0] === 'enable') {
            setRestart(true);

            return;
        }

        forgetToolStatus();
        router.reload();
    };

    const steps: WslStep[] | null =
        wsl.state === 'missing'
            ? ['enable']
            : wsl.state === 'no-distro'
              ? ['download', 'import']
              : wsl.state === 'stale'
                ? ['backup', 'reset', 'download', 'import', 'restore']
                : null;

    return (
        <Card label="LaraKube Linux">
            <div className="flex items-start gap-3 py-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-accent" />
                <div className="space-y-3 text-sm">
                    <p className="font-medium">{wsl.message}</p>
                    {restart ? (
                        <p className="text-soft">
                            If Windows asked you to restart, restart now. Then
                            open LaraKube Desktop again and it will finish
                            setting up.
                        </p>
                    ) : steps ? (
                        <>
                            <p className="text-soft">
                                {wsl.state === 'missing'
                                    ? 'LaraKube Desktop runs its tools in a small Linux that Windows provides. Windows will ask for permission once.'
                                    : wsl.state === 'stale'
                                      ? 'Your projects are backed up, the Linux is replaced with the newer one, then your projects are put back — all in one step.'
                                      : 'LaraKube Desktop will download its own small Linux, with every tool ready. It stays separate from anything else on this computer.'}
                            </p>
                            {working !== null && (
                                <div className="space-y-3 rounded-xl border border-line bg-paper/60 p-4">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-ink">
                                            {steps.length > 1
                                                ? `Step ${steps.indexOf(working) + 1} of ${steps.length}: ${WSL_STEP_LABELS[working]}`
                                                : WSL_STEP_LABELS[working]}
                                        </span>
                                        <span className="font-mono text-soft">
                                            {working === 'download' &&
                                            downloadProgress &&
                                            downloadProgress.total > 0
                                                ? `${downloadProgress.formatted ?? ''}${downloadProgress.percent > 0 ? ` (${downloadProgress.percent}%)` : ''}`
                                                : working === 'import'
                                                  ? 'Unpacking (~1–2m)…'
                                                  : 'Working…'}
                                        </span>
                                    </div>
                                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-badge">
                                        {working === 'download' &&
                                        downloadProgress &&
                                        downloadProgress.total > 0 ? (
                                            <div
                                                className="h-full bg-accent transition-all duration-300 ease-out"
                                                style={{
                                                    width: `${Math.min(100, Math.max(0, downloadProgress.percent))}%`,
                                                }}
                                            />
                                        ) : (
                                            <div className="h-full w-full animate-pulse rounded-full bg-accent/80" />
                                        )}
                                    </div>
                                    <p className="text-xs leading-relaxed text-soft">
                                        {WSL_STEP_DESCRIPTIONS[working]}
                                    </p>
                                    {steps.length > 1 && (
                                        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2">
                                            {steps.map((s, idx) => {
                                                const currentIdx =
                                                    steps.indexOf(working);
                                                const isDone = idx < currentIdx;
                                                const isCurrent =
                                                    idx === currentIdx;

                                                return (
                                                    <div
                                                        key={s}
                                                        className="flex items-center gap-1.5 text-xs"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex size-5 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                                                                isDone &&
                                                                    'bg-ok text-white',
                                                                isCurrent &&
                                                                    'animate-pulse bg-accent text-white',
                                                                !isDone &&
                                                                    !isCurrent &&
                                                                    'bg-badge text-faint',
                                                            )}
                                                        >
                                                            {isDone ? (
                                                                <Check className="size-3 stroke-[3]" />
                                                            ) : (
                                                                idx + 1
                                                            )}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                'text-[12px]',
                                                                isCurrent &&
                                                                    'font-semibold text-ink',
                                                                isDone &&
                                                                    'font-medium text-soft',
                                                                !isDone &&
                                                                    !isCurrent &&
                                                                    'text-faint',
                                                            )}
                                                        >
                                                            {
                                                                WSL_STEP_SHORT_LABELS[
                                                                    s
                                                                ]
                                                            }
                                                        </span>
                                                        {idx <
                                                            steps.length -
                                                                1 && (
                                                            <span className="text-faint/60">
                                                                →
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            <Button
                                disabled={working !== null}
                                onClick={() => run(steps)}
                            >
                                {working ? (
                                    <>
                                        <RefreshCw className="size-4 animate-spin" />
                                        {working === 'download' &&
                                        downloadProgress &&
                                        downloadProgress.percent > 0
                                            ? `Downloading… ${downloadProgress.percent}%`
                                            : `${WSL_STEP_LABELS[working]}…`}
                                    </>
                                ) : wsl.state === 'missing' ? (
                                    <>
                                        <Power className="size-4" />
                                        Turn on WSL
                                    </>
                                ) : wsl.state === 'stale' ? (
                                    <>
                                        <ArrowUpCircle className="size-4" />
                                        Update LaraKube Linux
                                    </>
                                ) : (
                                    <>
                                        <Download className="size-4" />
                                        Set up LaraKube Linux
                                    </>
                                )}
                            </Button>
                        </>
                    ) : wsl.command ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-term px-3 py-2 font-mono text-xs text-term-bright">
                            <code>{wsl.command}</code>
                            <CopyButton value={wsl.command} />
                        </div>
                    ) : (
                        <p className="text-soft">
                            Restart your computer, and make sure virtualization
                            is turned on in the BIOS. Then open LaraKube Desktop
                            and press Check again.
                        </p>
                    )}
                    {error && <p className="text-accent">{error}</p>}
                </div>
            </div>
        </Card>
    );
}
