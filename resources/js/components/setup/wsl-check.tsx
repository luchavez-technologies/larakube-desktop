import { useState } from 'react';
import { router } from '@inertiajs/react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { forgetToolStatus } from '@/lib/tool-status';

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

type WslStep =
    | 'enable'
    | 'download'
    | 'import'
    | 'backup'
    | 'reset'
    | 'restore';

const WSL_STEP_LABELS: Record<WslStep, string> = {
    enable: 'Turning on Windows Subsystem for Linux',
    download: 'Downloading LaraKube Linux (about 300 MB)',
    import: 'Installing LaraKube Linux',
    backup: 'Backing up your projects',
    reset: 'Removing the older LaraKube Linux',
    restore: 'Restoring your projects',
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
    const [error, setError] = useState<string | null>(null);
    const [restart, setRestart] = useState(false);

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
                            <Button
                                disabled={working !== null}
                                onClick={() => run(steps)}
                            >
                                {working
                                    ? `${WSL_STEP_LABELS[working]}…`
                                    : wsl.state === 'missing'
                                      ? 'Turn on WSL'
                                      : wsl.state === 'stale'
                                        ? 'Update LaraKube Linux'
                                        : 'Set up LaraKube Linux'}
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
