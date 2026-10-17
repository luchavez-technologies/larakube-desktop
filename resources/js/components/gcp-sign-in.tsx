import { useEffect, useState, useCallback } from 'react';
import { router } from '@inertiajs/react';
import {
    ExternalLink,
    RefreshCw,
    X,
    ArrowRight,
    Check,
    CheckCircle2,
    RotateCw,
    AlertCircle,
} from 'lucide-react';
import Button from '@/components/button';
import CopyButton from '@/components/copy-button';
import ProviderLogo from '@/components/provider-logo';
import Redactable from '@/components/redactable';
import SelectMenu from '@/components/select-menu';
import { sendJson } from '@/lib/http';
import { useRightDrawerOpen } from '@/lib/right-drawer-open';
import { forgetToolStatus } from '@/lib/tool-status';
import { cn } from '@/lib/utils';

type SignInState = {
    state: 'starting' | 'waiting-code' | 'signing-in' | 'done' | 'failed';
    url: string | null;
    message: string | null;
};

type Project = { id: string; name: string };

/** A button that opens the Google Cloud slide-over drawer to sign in and pick a project. */
export default function GcpSignIn({
    label = 'Sign in with Google',
    size = 'sm',
    variant = 'secondary',
    className = '',
}: {
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    className?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                type="button"
                variant={variant}
                size={size}
                onClick={() => setOpen(true)}
                className={cn('shrink-0 gap-1.5', className)}
            >
                <ExternalLink className="size-3.5" />
                <span>{label}</span>
            </Button>
            {open && <GcpSignInDrawer onClose={() => setOpen(false)} />}
        </>
    );
}

export function GcpSignInDrawer({ onClose }: { onClose: () => void }) {
    useRightDrawerOpen(true);

    const [slidIn, setSlidIn] = useState(false);
    const [run, setRun] = useState<number | null>(null);
    const [status, setStatus] = useState<SignInState>({
        state: 'starting',
        url: null,
        message: null,
    });
    const [error, setError] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [projects, setProjects] = useState<Project[] | null>(null);
    const [project, setProject] = useState('');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const id = requestAnimationFrame(() => setSlidIn(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const handleClose = useCallback(() => {
        setSlidIn(false);
        setTimeout(onClose, 250);
    }, [onClose]);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                handleClose();
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleClose]);

    useEffect(() => {
        let alive = true;
        setRun(null);
        setError(null);
        setStatus({ state: 'starting', url: null, message: null });

        void sendJson<{ run: number }>('/setup/cloud/gcp/login', 'POST').then(
            (result) => {
                if (!alive) {
                    return;
                }

                if (result.ok) {
                    setRun(result.data.run);
                } else {
                    setError(result.data.message ?? 'Could not start sign-in.');
                }
            },
        );

        return () => {
            alive = false;
        };
    }, [attempt]);

    useEffect(() => {
        if (
            run === null ||
            status.state === 'done' ||
            status.state === 'failed'
        ) {
            return;
        }

        const timer = setInterval(() => {
            void sendJson<SignInState>(
                `/setup/cloud/gcp/login/${run}`,
                'GET',
            ).then((result) => result.ok && setStatus(result.data));
        }, 1500);

        return () => clearInterval(timer);
    }, [run, status.state]);

    useEffect(() => {
        if (status.state !== 'done' || projects !== null) {
            return;
        }

        void sendJson<{ projects: Project[] }>(
            '/setup/cloud/gcp/projects',
            'GET',
        ).then((result) => {
            const list = result.data.projects ?? [];
            setProjects(list);
            setProject(list[0]?.id ?? '');
        });
    }, [status.state, projects]);

    const submitCode = async () => {
        if (run === null) {
            return;
        }

        const result = await sendJson(
            `/setup/cloud/gcp/login/${run}/code`,
            'POST',
            { code: code.trim() },
        );

        if (!result.ok) {
            setError(
                'That code does not look right. Please copy it again from Google.',
            );
            return;
        }

        setError(null);
        setStatus({ ...status, state: 'signing-in' });
    };

    const finish = async () => {
        if (project !== '') {
            await sendJson('/setup/cloud/gcp/project', 'POST', {
                project_id: project,
            });
        }

        forgetToolStatus();
        router.reload();
        handleClose();
    };

    const openBrowser = () => {
        // Not an Inertia visit: that would reload the page behind this drawer and close it.
        void sendJson('/open', 'POST', {
            url: status.url ?? '',
        }).then((result) => {
            if (!result.ok) {
                setError(
                    'Could not open your default browser. Please use Copy address and paste it into a browser tab.',
                );
            }
        });
    };

    return (
        <div
            className={cn(
                'fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity duration-300',
                slidIn ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onClick={handleClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Sign in to Google Cloud"
                className={cn(
                    'flex h-full w-full max-w-lg flex-col overflow-hidden bg-surface shadow-2xl ring-1 ring-line transition-transform duration-300 ease-out md:max-w-xl',
                    slidIn ? 'translate-x-0' : 'translate-x-full',
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drawer Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-6 py-4.5">
                    <div className="flex items-center gap-3">
                        <ProviderLogo provider="gcp" size="md" />
                        <div>
                            <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink">
                                Sign in to Google Cloud
                            </h2>
                            <p className="text-xs text-soft">
                                Authorize LaraKube with your Google Cloud
                                account
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="cursor-pointer rounded-lg p-1.5 text-soft transition hover:bg-badge hover:text-ink"
                        aria-label="Close drawer"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Drawer Body */}
                <div className="flex-1 [scrollbar-width:thin] space-y-5 overflow-y-auto p-6">
                    {error && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/10 p-3.5 text-xs text-accent">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <p className="leading-relaxed">{error}</p>
                        </div>
                    )}

                    {/* State: Starting */}
                    {status.state === 'starting' && !error && (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface/50 p-8 text-center">
                            <RefreshCw className="size-6 animate-spin text-brand" />
                            <div>
                                <span className="text-sm font-medium text-ink">
                                    Preparing Google authorization…
                                </span>
                                <p className="mt-1 text-xs text-soft">
                                    Connecting to Google Cloud CLI to generate
                                    your single-use sign-in link.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* State: Waiting for Code (3-step visual cards) */}
                    {status.state === 'waiting-code' && status.url && (
                        <div className="space-y-4">
                            {/* Step 1 Card */}
                            <div className="rounded-xl border border-line bg-surface/60 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                                        1
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-2.5">
                                        <div>
                                            <h3 className="text-xs font-semibold text-ink">
                                                Approve access in your browser
                                            </h3>
                                            <p className="mt-0.5 text-xs leading-relaxed text-soft">
                                                Open Google&apos;s authorization
                                                page and sign in with the Google
                                                account you wish to use for your
                                                infrastructure.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={openBrowser}
                                                className="gap-1.5"
                                            >
                                                <ExternalLink className="size-3.5" />
                                                <span>Open Google sign-in</span>
                                            </Button>
                                            <CopyButton
                                                value={status.url ?? ''}
                                                label="Copy link address"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Step 2 Card */}
                            <div className="rounded-xl border border-line bg-surface/60 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                                        2
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-xs font-semibold text-ink">
                                            Copy the authorization code
                                        </h3>
                                        <p className="mt-0.5 text-xs leading-relaxed text-soft">
                                            After clicking &quot;Allow&quot;,
                                            Google will present you with an
                                            authorization code. Copy that entire
                                            code string.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Step 3 Card */}
                            <div className="rounded-xl border border-line bg-surface/60 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                                        3
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-3">
                                        <div>
                                            <h3 className="text-xs font-semibold text-ink">
                                                Paste code to complete sign-in
                                            </h3>
                                            <p className="mt-0.5 text-xs leading-relaxed text-soft">
                                                Paste the verification code from
                                                Google below to finish local
                                                authentication:
                                            </p>
                                        </div>
                                        <div className="space-y-2.5">
                                            <input
                                                value={code}
                                                onChange={(e) =>
                                                    setCode(e.target.value)
                                                }
                                                placeholder="Paste authorization code here (e.g. 4/0A...)"
                                                spellCheck={false}
                                                className="w-full rounded-xl border-0 bg-surface px-3.5 py-2.5 font-mono text-xs ring-1 ring-line outline-none placeholder:font-sans placeholder:text-faint focus:ring-2 focus:ring-brand"
                                            />
                                            <Button
                                                type="button"
                                                variant="primary"
                                                size="sm"
                                                disabled={
                                                    code.trim().length < 8
                                                }
                                                onClick={() =>
                                                    void submitCode()
                                                }
                                                className="gap-1.5"
                                            >
                                                <ArrowRight className="size-3.5" />
                                                <span>Continue</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* State: Signing In */}
                    {status.state === 'signing-in' && (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface/50 p-8 text-center">
                            <RefreshCw className="size-6 animate-spin text-brand" />
                            <div>
                                <span className="text-sm font-medium text-ink">
                                    Verifying with Google Cloud…
                                </span>
                                <p className="mt-1 text-xs text-soft">
                                    Saving and validating your credentials
                                    locally via the Google Cloud CLI.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* State: Done / Select Project */}
                    {status.state === 'done' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2.5 rounded-xl border border-ok/25 bg-ok/10 p-3.5 text-xs font-medium text-ok dark:text-emerald-400">
                                <CheckCircle2 className="size-4 shrink-0" />
                                <span>
                                    Successfully authenticated with Google
                                    Cloud!
                                </span>
                            </div>

                            <div className="space-y-3 rounded-xl border border-line bg-surface/60 p-4">
                                <div>
                                    <h3 className="text-xs font-semibold text-ink">
                                        Select Google Cloud Project
                                    </h3>
                                    <p className="mt-0.5 text-xs text-soft">
                                        Choose the Google Cloud project to use
                                        for provisioning and managing your
                                        servers:
                                    </p>
                                </div>

                                {projects === null ? (
                                    <div className="flex items-center gap-2 py-3 text-xs text-soft">
                                        <RefreshCw className="size-3.5 animate-spin" />
                                        <span>
                                            Loading your Google Cloud projects…
                                        </span>
                                    </div>
                                ) : projects.length === 0 ? (
                                    <div className="space-y-2 rounded-lg bg-surface/80 p-3 text-xs text-soft">
                                        <p>
                                            No projects found on this Google
                                            account. Please create one in the
                                            Google Cloud Console, then try
                                            again.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setAttempt((c) => c + 1)
                                            }
                                            className="gap-1.5"
                                        >
                                            <RotateCw className="size-3.5" />
                                            <span>Retry project search</span>
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <SelectMenu
                                            value={project}
                                            onChange={setProject}
                                            options={projects.map(
                                                (candidate) => ({
                                                    value: candidate.id,
                                                    label: (
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="font-medium text-ink">
                                                                {candidate.name}
                                                            </span>
                                                            <span className="font-mono text-[11px] text-faint">
                                                                (
                                                                <Redactable
                                                                    value={
                                                                        candidate.id
                                                                    }
                                                                    kind="account"
                                                                />
                                                                )
                                                            </span>
                                                        </span>
                                                    ),
                                                }),
                                            )}
                                        />
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            disabled={
                                                projects === null ||
                                                project === ''
                                            }
                                            onClick={() => void finish()}
                                            className="gap-1.5"
                                        >
                                            <Check className="size-3.5" />
                                            <span>Use this project</span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* State: Failed */}
                    {status.state === 'failed' && (
                        <div className="space-y-4 rounded-xl border border-accent/20 bg-accent/10 p-4">
                            <div className="flex items-start gap-2.5 text-xs text-accent">
                                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                <div>
                                    <span className="font-semibold">
                                        Sign-in did not complete
                                    </span>
                                    <p className="mt-0.5 text-soft">
                                        Google Cloud CLI encountered an issue
                                        verifying credentials.
                                    </p>
                                </div>
                            </div>
                            {status.message && (
                                <pre className="max-h-48 overflow-x-auto rounded-lg bg-term p-3 font-mono text-xs whitespace-pre-wrap text-term-bright">
                                    {status.message}
                                </pre>
                            )}
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setAttempt((count) => count + 1)}
                                className="gap-1.5"
                            >
                                <RotateCw className="size-3.5" />
                                <span>Try again</span>
                            </Button>
                        </div>
                    )}
                </div>

                {/* Sticky Drawer Footer */}
                <div className="flex shrink-0 items-center justify-between border-t border-line/60 bg-surface/90 px-6 py-3.5 backdrop-blur-xs">
                    {status.state === 'waiting-code' ? (
                        <button
                            type="button"
                            onClick={() => setAttempt((c) => c + 1)}
                            className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-soft hover:text-ink"
                        >
                            <RotateCw className="size-3" />
                            <span>Restart authorization</span>
                        </button>
                    ) : (
                        <div />
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClose}
                        className="gap-1.5"
                    >
                        <X className="size-3.5" />
                        <span>Close</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
