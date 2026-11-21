import { useEffect, useState } from 'react';
import { Link } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowLeft,
    Check,
    CheckCircle2,
    ExternalLink,
    RefreshCw,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import CopyButton from '@/components/copy-button';
import LiveRunSteps from '@/components/live-run-steps';
import QrCodePopover from '@/components/qr-code-popover';
import Redactable from '@/components/redactable';
import StatusPill from '@/components/status-pill';
import { useAddressReadiness } from '@/lib/address-readiness';
import { sendJson } from '@/lib/http';
import { ExternalLinkButton } from '@/lib/open-external';
import { elapsedSince } from '@/lib/run-steps';
import { runStatus } from '@/lib/servers';
import { useCelebrateOnSuccess } from '@/lib/use-celebrate';
import { cn } from '@/lib/utils';
import { show as showRunRoute } from '@/routes/runs';

/**
 * What an install looks like once it has started, shared by Quick Launch and
 * the App Store: the live step list while it runs, then the address with its
 * DNS and HTTPS checks and any bootstrap login, in the same drawer.
 */

export type LaunchedRun = {
    id: number;
    label: string;
    status: string;
    /** The run's log so far; its `▸` lines are the live step list. */
    output?: string;
    startedAt?: string | null;
};

export type LaunchedTool = {
    slug: string;
    displayName: string;
    domain: string;
};

export type ToolCredentials = Record<string, string>;

/**
 * Follows a started install: polls its run until it finishes, then fetches the
 * tool's bootstrap credentials once. The floating activity log streams the raw
 * output from the same endpoint, so this only keeps what the panel shows.
 */
export function useToolLaunch(serverName: string) {
    const [run, setRun] = useState<LaunchedRun | null>(null);
    const [tool, setTool] = useState<LaunchedTool | null>(null);
    const [credentials, setCredentials] = useState<ToolCredentials | null>(
        null,
    );
    const [credentialsChecked, setCredentialsChecked] = useState(false);

    useEffect(() => {
        if (!run || run.status !== 'running') return;

        let isMounted = true;

        const tick = async () => {
            const res = await sendJson<{
                id: number;
                status: string;
                output: string;
                startedAt: string | null;
            }>(`/runs/${run.id}/stream`, 'GET');

            if (isMounted && res.ok) {
                setRun((prev) =>
                    prev && prev.id === res.data.id
                        ? {
                              ...prev,
                              status: res.data.status,
                              output: res.data.output,
                              startedAt: res.data.startedAt,
                          }
                        : prev,
                );
            }
        };

        void tick();
        const interval = setInterval(() => void tick(), 1500);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [run?.id, run?.status]);

    useEffect(() => {
        if (!run || run.status !== 'succeeded' || !tool || credentialsChecked) {
            return;
        }

        setCredentialsChecked(true);

        void (async () => {
            const res = await sendJson<{ credentials: ToolCredentials | null }>(
                `/servers/${encodeURIComponent(serverName)}/tools/${encodeURIComponent(tool.slug)}/credentials?domain=${encodeURIComponent(tool.domain)}`,
                'GET',
            );

            if (res.ok) {
                setCredentials(res.data.credentials ?? null);
            }
        })();
    }, [run, tool, credentialsChecked, serverName]);

    const start = (
        startedRun: LaunchedRun,
        startedTool: LaunchedTool | null,
    ) => {
        setCredentials(null);
        setCredentialsChecked(false);
        setTool(startedTool);
        setRun(startedRun);
    };

    const reset = () => {
        setRun(null);
        setTool(null);
        setCredentials(null);
        setCredentialsChecked(false);
    };

    return {
        run,
        tool,
        credentials,
        credentialsLoading: run?.status === 'succeeded' && !credentialsChecked,
        start,
        reset,
    };
}

function AddressCheckPill({
    label,
    check,
    pending,
}: {
    label: string;
    check: { ready: boolean; detail: string } | null;
    pending: string;
}) {
    const ready = check?.ready ?? false;

    return (
        <span
            title={check?.detail ?? pending}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
                ready
                    ? 'bg-ok/10 text-ok ring-ok/25'
                    : 'bg-warn/10 text-warn ring-warn/25',
            )}
        >
            {ready ? (
                <CheckCircle2 className="size-3" />
            ) : (
                <RefreshCw className="size-3 animate-spin" />
            )}
            <span>
                {label}: {ready ? 'ready' : pending.toLowerCase()}
            </span>
        </span>
    );
}

/**
 * Replaces an install drawer's form once the install starts: the live step
 * list, then (on success) the address and any bootstrap credentials, in place.
 * The floating activity log already has the raw output for anyone who wants it.
 */
export function ToolLaunchProgress({
    run,
    tool,
    appName,
    adminPath,
    credentials,
    credentialsLoading,
    onClose,
    onRetry,
    retryLabel = 'Back to Review',
}: {
    run: LaunchedRun;
    tool: LaunchedTool | null;
    appName: string;
    adminPath?: string;
    credentials: ToolCredentials | null;
    credentialsLoading: boolean;
    onClose: () => void;
    onRetry: () => void;
    retryLabel?: string;
}) {
    const isRunning = run.status === 'running';
    const isSucceeded = run.status === 'succeeded';
    const isFailed = !isRunning && !isSucceeded;
    useCelebrateOnSuccess(isSucceeded);
    const [statusLabel, statusTone] = runStatus[
        run.status as keyof typeof runStatus
    ] ?? ['Unknown', 'muted'];
    const hasCredentials =
        credentials !== null && Object.keys(credentials).length > 0;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!isRunning) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [isRunning]);
    const elapsed = elapsedSince(run.startedAt ?? null, now);
    const address = useAddressReadiness(
        isSucceeded && tool ? tool.domain : null,
    );
    const addressReady =
        (address.dns?.ready ?? false) && (address.https?.ready ?? false);

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 p-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                        {isRunning && (
                            <RefreshCw className="size-4 shrink-0 animate-spin text-brand" />
                        )}
                        {isSucceeded && (
                            <CheckCircle2 className="size-4 shrink-0 text-ok" />
                        )}
                        {isFailed && (
                            <AlertCircle className="size-4 shrink-0 text-accent" />
                        )}
                        <span className="truncate text-sm font-semibold text-ink">
                            {run.label}
                        </span>
                    </div>
                    <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                </div>

                {(isRunning || isFailed) && (
                    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold tracking-wide text-soft uppercase">
                                Progress
                            </span>
                            {isRunning && elapsed && (
                                <span className="font-mono text-[11px] text-faint">
                                    {elapsed}
                                </span>
                            )}
                        </div>
                        <LiveRunSteps
                            output={run.output ?? ''}
                            status={run.status}
                        />
                        {isRunning && (
                            <p className="mt-3 text-[11px] text-faint">
                                You can close this panel: the install keeps
                                going, and its pill at the bottom of the window
                                shows where it is.
                            </p>
                        )}
                    </div>
                )}

                {isSucceeded && tool && (
                    <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
                        <div className="flex items-center gap-2 text-ok">
                            <CheckCircle2 className="size-4.5 shrink-0" />
                            <span className="text-sm font-semibold text-ink">
                                {addressReady
                                    ? `${appName} is ready`
                                    : `${appName} is installed`}
                            </span>
                        </div>

                        {(() => {
                            const adminUrl = `https://${tool.domain}${adminPath ?? ''}`;

                            return (
                                <div className="flex items-center justify-between gap-2 rounded-lg bg-paper/60 px-3 py-2">
                                    <div className="min-w-0">
                                        <span className="block text-[10px] text-faint uppercase">
                                            Admin URL
                                        </span>
                                        <span className="block truncate font-mono text-xs text-brand">
                                            {adminUrl}
                                        </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {/* Opening before DNS resolves and the certificate is issued only shows a
                                            browser error, so Open waits for both. */}
                                        <ExternalLinkButton
                                            url={adminUrl}
                                            title={
                                                addressReady
                                                    ? 'Open in default browser'
                                                    : 'Waiting for DNS and HTTPS. Open anyway'
                                            }
                                            className={buttonClass(
                                                addressReady
                                                    ? 'secondary'
                                                    : 'ghost',
                                                'sm',
                                            )}
                                        >
                                            <ExternalLink className="size-3.5" />
                                            <span>
                                                {addressReady
                                                    ? 'Open'
                                                    : 'Open anyway'}
                                            </span>
                                        </ExternalLinkButton>
                                        <QrCodePopover
                                            url={adminUrl}
                                            title={appName}
                                            description={`Scan to open ${appName} on your mobile device`}
                                        />
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="flex flex-wrap items-center gap-2">
                            <AddressCheckPill
                                label="DNS"
                                check={address.dns}
                                pending="Waiting for the DNS record"
                            />
                            <AddressCheckPill
                                label="HTTPS"
                                check={address.https}
                                pending="Waiting for the certificate"
                            />
                        </div>

                        {credentialsLoading && (
                            <p className="flex items-center gap-1.5 text-xs text-soft">
                                <RefreshCw className="size-3 animate-spin" />
                                <span>Checking for bootstrap credentials…</span>
                            </p>
                        )}

                        {!credentialsLoading && hasCredentials && (
                            <div className="space-y-2">
                                {credentials?.admin_username && (
                                    <CredentialRow
                                        label="Admin Username"
                                        value={credentials.admin_username}
                                    />
                                )}
                                {credentials?.admin_email && (
                                    <CredentialRow
                                        label="Admin Email"
                                        value={credentials.admin_email}
                                    />
                                )}
                                {credentials?.admin_password && (
                                    <CredentialRow
                                        label="Admin Password"
                                        value={credentials.admin_password}
                                    />
                                )}
                                <p className="text-[11px] text-soft">
                                    Shown here once, in plain text — change this
                                    password on first login if anyone else could
                                    have seen your screen or logs.
                                </p>
                            </div>
                        )}

                        {!credentialsLoading && !hasCredentials && (
                            <p className="text-xs text-soft">
                                No seeded admin account — the first person to
                                open the URL above claims it.
                            </p>
                        )}
                    </div>
                )}

                {isFailed && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-tint p-4 text-xs text-accent">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                            The deployment failed. Check the Activity panel at
                            the bottom right, or open the full entry below for
                            the complete log.
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-4 sm:px-6">
                <Link
                    href={showRunRoute(run.id).url}
                    className="inline-flex items-center gap-1 text-xs text-soft hover:text-ink hover:underline"
                >
                    <span>View in Activity</span>
                    <ExternalLink className="size-3" />
                </Link>
                <div className="flex items-center gap-2">
                    {isFailed && (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onRetry}
                        >
                            <ArrowLeft className="size-3.5" />
                            <span>{retryLabel}</span>
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="primary"
                        disabled={isRunning}
                        onClick={onClose}
                    >
                        <Check className="size-3.5" />
                        <span>Done</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-paper/60 px-3 py-2">
            <div className="min-w-0">
                <span className="block text-[10px] text-faint uppercase">
                    {label}
                </span>
                <span className="block truncate font-mono text-xs text-ink">
                    <Redactable value={value} kind="text" />
                </span>
            </div>
            <CopyButton value={value} size="sm" />
        </div>
    );
}
