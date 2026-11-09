import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    Check,
    ChevronDown,
    ChevronRight,
    Trash2,
    XCircle,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { sendJson } from '@/lib/http';

type DangerZoneTabProps = {
    windows?: boolean;
};

export default function DangerZoneTab({ windows = false }: DangerZoneTabProps) {
    const isDarwin = !windows;
    const [open, setOpen] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [removeCli, setRemoveCli] = useState(true);
    const [removeShellPath, setRemoveShellPath] = useState(true);
    const [purgeClusterData, setPurgeClusterData] = useState(false);
    const [removeWsl, setRemoveWsl] = useState(windows);
    const [purgeAppData, setPurgeAppData] = useState(true);
    const [trashAppBundle, setTrashAppBundle] = useState(isDarwin);

    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            window.location.search.includes('action=uninstall')
        ) {
            setOpen(true);
        }
    }, []);

    const handleUninstall = async () => {
        setWorking(true);
        setError(null);
        try {
            const res = await sendJson<{ success: boolean; actions: string[] }>(
                '/uninstall',
                'POST',
                {
                    removeCli,
                    removeShellPath,
                    purgeClusterData,
                    removeWsl,
                    purgeAppData,
                    trashAppBundle,
                },
            );

            if (res.ok && res.data.success) {
                setSuccessMessage(
                    'Uninstallation complete. LaraKube Desktop is quitting…',
                );
            } else {
                setError(
                    res.data.message ??
                        'Uninstallation could not be completed.',
                );
                setWorking(false);
            }
        } catch (e: any) {
            setError(e?.message ?? 'Failed to execute uninstallation.');
            setWorking(false);
        }
    };

    return (
        <div className="space-y-5">
            <Card label="Danger Zone">
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => setOpen(!open)}
                        className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-soft transition-colors hover:text-ink"
                    >
                        <span className="flex items-center gap-1.5 font-semibold text-accent">
                            <AlertTriangle className="size-3.5" />
                            Uninstall LaraKube Desktop & Clean Up
                        </span>
                        {open ? (
                            <ChevronDown className="size-3.5" />
                        ) : (
                            <ChevronRight className="size-3.5" />
                        )}
                    </button>

                    {open && (
                        <div className="mt-2 space-y-4 rounded-xl border border-accent/20 bg-accent/[0.03] p-4 text-xs">
                            <p className="leading-relaxed text-soft">
                                Configure what components are removed from this
                                computer. You can choose to preserve CLI tools
                                if you wish to continue using them from your
                                terminal.
                            </p>

                            <div className="space-y-2.5">
                                <label className="flex cursor-pointer items-start gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={removeCli}
                                        onChange={(e) => {
                                            setRemoveCli(e.target.checked);
                                            if (!e.target.checked) {
                                                setRemoveShellPath(false);
                                            }
                                        }}
                                        className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                    />
                                    <div>
                                        <span className="font-medium text-ink">
                                            Remove LaraKube CLI & Companion
                                            Tools
                                        </span>
                                        <span className="block text-[11px] text-soft">
                                            Deletes{' '}
                                            <code className="font-mono text-ink">
                                                ~/.larakube/bin
                                            </code>{' '}
                                            (contains larakube, kubectl, tofu,
                                            k9s, tea, gh).
                                        </span>
                                    </div>
                                </label>

                                <label className="flex cursor-pointer items-start gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={removeShellPath}
                                        onChange={(e) =>
                                            setRemoveShellPath(e.target.checked)
                                        }
                                        className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                    />
                                    <div>
                                        <span className="font-medium text-ink">
                                            Remove PATH Export from Shell
                                            Profiles
                                        </span>
                                        <span className="block text-[11px] text-soft">
                                            Cleans PATH lines from{' '}
                                            <code className="font-mono text-ink">
                                                ~/.zshrc
                                            </code>
                                            ,{' '}
                                            <code className="font-mono text-ink">
                                                ~/.bashrc
                                            </code>
                                            , and{' '}
                                            <code className="font-mono text-ink">
                                                ~/.profile
                                            </code>
                                            .
                                        </span>
                                    </div>
                                </label>

                                <label className="flex cursor-pointer items-start gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={purgeClusterData}
                                        onChange={(e) =>
                                            setPurgeClusterData(
                                                e.target.checked,
                                            )
                                        }
                                        className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                    />
                                    <div>
                                        <span className="font-medium text-ink">
                                            Purge Cluster Credentials & Local
                                            State
                                        </span>
                                        <span className="block text-[11px] text-amber-600 dark:text-amber-400">
                                            ⚠️ Deletes{' '}
                                            <code className="font-mono text-ink">
                                                ~/.larakube
                                            </code>{' '}
                                            (kubeconfigs, OpenTofu state,
                                            secrets). Leave unchecked to keep
                                            access to live cloud clusters.
                                        </span>
                                    </div>
                                </label>

                                {windows && (
                                    <label className="flex cursor-pointer items-start gap-2.5">
                                        <input
                                            type="checkbox"
                                            checked={removeWsl}
                                            onChange={(e) =>
                                                setRemoveWsl(e.target.checked)
                                            }
                                            className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                        />
                                        <div>
                                            <span className="font-medium text-ink">
                                                Remove LaraKube Linux (WSL 2)
                                                Distro
                                            </span>
                                            <span className="block text-[11px] text-soft">
                                                Unregisters{' '}
                                                <code className="font-mono text-ink">
                                                    larakube-ubuntu
                                                </code>{' '}
                                                to reclaim disk space. Projects
                                                are backed up to{' '}
                                                <code className="font-mono text-ink">
                                                    %LOCALAPPDATA%\LaraKube\backups
                                                </code>{' '}
                                                first.
                                            </span>
                                        </div>
                                    </label>
                                )}

                                <label className="flex cursor-pointer items-start gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={purgeAppData}
                                        onChange={(e) =>
                                            setPurgeAppData(e.target.checked)
                                        }
                                        className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                    />
                                    <div>
                                        <span className="font-medium text-ink">
                                            Purge Local Application Cache & Logs
                                        </span>
                                        <span className="block text-[11px] text-soft">
                                            Clears cached session files, logs,
                                            and internal desktop database.
                                        </span>
                                    </div>
                                </label>

                                {isDarwin && (
                                    <label className="flex cursor-pointer items-start gap-2.5">
                                        <input
                                            type="checkbox"
                                            checked={trashAppBundle}
                                            onChange={(e) =>
                                                setTrashAppBundle(
                                                    e.target.checked,
                                                )
                                            }
                                            className="mt-0.5 size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                                        />
                                        <div>
                                            <span className="font-medium text-ink">
                                                Move LaraKube.app to macOS Trash
                                            </span>
                                            <span className="block text-[11px] text-soft">
                                                Moves{' '}
                                                <code className="font-mono text-ink">
                                                    /Applications/LaraKube.app
                                                </code>{' '}
                                                to Trash and exits.
                                            </span>
                                        </div>
                                    </label>
                                )}
                            </div>

                            {successMessage ? (
                                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 font-medium text-emerald-600 dark:text-emerald-400">
                                    <Check className="size-4 shrink-0" />
                                    <span>{successMessage}</span>
                                </div>
                            ) : confirming ? (
                                <div className="space-y-3 border-t border-accent/20 pt-2">
                                    <div className="flex items-start gap-2 text-accent">
                                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                        <div>
                                            <p className="font-semibold">
                                                Confirm Uninstallation
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-soft">
                                                This will execute the selected
                                                cleanup actions and close
                                                LaraKube Desktop immediately.
                                                Are you sure you want to
                                                proceed?
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="danger"
                                            disabled={working}
                                            onClick={() =>
                                                void handleUninstall()
                                            }
                                        >
                                            <Trash2 className="size-3.5" />
                                            <span>
                                                {working
                                                    ? 'Uninstalling…'
                                                    : 'Confirm & Uninstall'}
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
                                </div>
                            ) : (
                                <div className="border-t border-accent/20 pt-2">
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={() => setConfirming(true)}
                                    >
                                        <Trash2 className="size-3.5" />
                                        <span>Uninstall LaraKube Desktop…</span>
                                    </Button>
                                </div>
                            )}

                            {error && (
                                <p className="text-xs text-accent">{error}</p>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
