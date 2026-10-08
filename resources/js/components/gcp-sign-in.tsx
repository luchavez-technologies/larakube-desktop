import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import Button from '@/components/button';
import CopyButton from '@/components/copy-button';
import SelectMenu from '@/components/select-menu';
import { sendJson } from '@/lib/http';
import { forgetToolStatus } from '@/lib/tool-status';

type SignInState = {
    state: 'starting' | 'waiting-code' | 'signing-in' | 'done' | 'failed';
    url: string | null;
    message: string | null;
};

type Project = { id: string; name: string };

/** A button that signs in to Google Cloud from the app: open Google's page, paste the code, pick a project. */
export default function GcpSignIn({ label = 'Sign in' }: { label?: string }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(true)}
                className="shrink-0 gap-1.5"
            >
                <ExternalLink className="size-3.5" />
                <span>{label}</span>
            </Button>
            {open && <SignInDialog onClose={() => setOpen(false)} />}
        </>
    );
}

function SignInDialog({ onClose }: { onClose: () => void }) {
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
                'That code does not look right. Copy it again from Google.',
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
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
            <div className="w-full max-w-lg space-y-4 rounded-2xl bg-surface p-6 text-sm shadow-xl ring-1 ring-line">
                <h2 className="text-lg font-semibold tracking-[-0.015em]">
                    Sign in to Google Cloud
                </h2>

                {error && <p className="text-accent">{error}</p>}

                {status.state === 'starting' && !error && (
                    <p className="flex items-center gap-2 text-soft">
                        <RefreshCw className="size-4 animate-spin" />
                        Getting the sign-in page ready…
                    </p>
                )}

                {status.state === 'waiting-code' && status.url && (
                    <div className="space-y-3">
                        <ol className="list-decimal space-y-1 pl-5 text-soft">
                            <li>
                                Open Google&apos;s sign-in page and approve.
                            </li>
                            <li>Copy the code Google shows you.</li>
                            <li>Paste it below.</li>
                        </ol>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                                // Not an Inertia visit: that would reload the page behind this dialog and close it.
                                void sendJson('/open', 'POST', {
                                    url: status.url ?? '',
                                }).then((result) => {
                                    if (!result.ok) {
                                        setError(
                                            'Could not open your browser. Use Copy address and paste it into one.',
                                        );
                                    }
                                })
                            }
                        >
                            Open Google sign-in
                        </Button>
                        <CopyButton
                            value={status.url ?? ''}
                            label="Copy address"
                        />
                        <input
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            placeholder="Paste the code here"
                            spellCheck={false}
                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2"
                        />
                        <Button
                            type="button"
                            disabled={code.trim().length < 8}
                            onClick={() => void submitCode()}
                        >
                            Continue
                        </Button>
                    </div>
                )}

                {status.state === 'signing-in' && (
                    <p className="flex items-center gap-2 text-soft">
                        <RefreshCw className="size-4 animate-spin" />
                        Signing in…
                    </p>
                )}

                {status.state === 'done' && (
                    <div className="space-y-3">
                        <p className="text-soft">
                            Signed in. Pick the project to use for servers.
                        </p>
                        {projects === null ? (
                            <p className="flex items-center gap-2 text-soft">
                                <RefreshCw className="size-4 animate-spin" />
                                Finding your projects…
                            </p>
                        ) : projects.length === 0 ? (
                            <p className="text-soft">
                                No projects found on this account. Create one in
                                the Google Cloud console, then sign in again.
                            </p>
                        ) : (
                            <SelectMenu
                                value={project}
                                onChange={setProject}
                                options={projects.map((candidate) => ({
                                    value: candidate.id,
                                    label: `${candidate.name} (${candidate.id})`,
                                }))}
                            />
                        )}
                        <Button
                            type="button"
                            disabled={projects === null}
                            onClick={() => void finish()}
                        >
                            Use this project
                        </Button>
                    </div>
                )}

                {status.state === 'failed' && (
                    <div className="space-y-3">
                        <p className="text-accent">Sign-in did not finish.</p>
                        {status.message && (
                            <pre className="overflow-x-auto rounded-lg bg-term px-3 py-2 font-mono text-xs whitespace-pre-wrap text-term-bright">
                                {status.message}
                            </pre>
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setAttempt((count) => count + 1)}
                        >
                            Try again
                        </Button>
                    </div>
                )}

                <div className="flex justify-end">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
