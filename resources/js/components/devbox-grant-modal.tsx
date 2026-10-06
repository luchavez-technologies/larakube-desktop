import { router, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Key, Shield, UserPlus, X, XCircle } from 'lucide-react';
import { SiGithub } from '@icons-pack/react-simple-icons';
import Button from '@/components/button';
import { cn } from '@/lib/utils';

export default function DevBoxGrantModal({
    isOpen,
    onClose,
    box,
}: {
    isOpen: boolean;
    onClose: () => void;
    box: string;
}) {
    const page = usePage();
    const pageErrors = (page.props.errors as Record<string, string>) || {};

    const [mode, setMode] = useState<'github' | 'key'>('github');
    const [github, setGithub] = useState('');
    const [pubkey, setPubkey] = useState('');
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    if (!isOpen) return null;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        const formErrors: Record<string, string> = {};
        if (mode === 'github') {
            const cleanGithub = github.trim().replace(/^@/, '');
            if (!cleanGithub) {
                formErrors.github = 'Please enter a GitHub username.';
            }
        } else {
            if (!pubkey.trim()) {
                formErrors.pubkey = 'Please enter an SSH public key.';
            }
        }

        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            return;
        }

        setProcessing(true);
        setErrors({});

        const cleanGithub = github.trim().replace(/^@/, '');
        const payload =
            mode === 'github'
                ? { github: cleanGithub }
                : { pubkey: pubkey.trim() };

        router.post(`/dev-boxes/${box}/access/grant`, payload, {
            onFinish: () => setProcessing(false),
            onError: (errs) => setErrors(errs as Record<string, string>),
            onSuccess: () => {
                onClose();
                setGithub('');
                setPubkey('');
            },
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line">
                <div className="flex items-center justify-between border-b border-line pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                            <UserPlus className="size-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-ink">
                                Grant Dev Box Access
                            </h3>
                            <p className="text-xs text-soft">
                                Authorize SSH access to{' '}
                                <span className="font-mono font-medium text-ink">
                                    {box}
                                </span>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="hover:bg-hover rounded-lg p-1 text-soft transition-colors hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-badge/20 p-3.5 text-xs text-soft">
                        <Shield className="mt-0.5 size-4 shrink-0 text-accent" />
                        <div className="leading-relaxed">
                            Grants SSH access to the{' '}
                            <span className="font-mono text-ink">larakube</span>{' '}
                            user without sharing your private root credentials.
                            You can revoke collaborator keys at any time.
                        </div>
                    </div>

                    {/* Mode Selector */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-soft">
                            Authorization Method
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setMode('github')}
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all',
                                    mode === 'github'
                                        ? 'border-accent bg-accent/10 text-ink shadow-xs ring-1 ring-accent'
                                        : 'border-line text-soft hover:border-soft/60 hover:text-ink',
                                )}
                            >
                                <SiGithub className="size-4" />
                                <span>GitHub Username</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('key')}
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-all',
                                    mode === 'key'
                                        ? 'border-accent bg-accent/10 text-ink shadow-xs ring-1 ring-accent'
                                        : 'border-line text-soft hover:border-soft/60 hover:text-ink',
                                )}
                            >
                                <Key className="size-4" />
                                <span>SSH Public Key</span>
                            </button>
                        </div>
                    </div>

                    {mode === 'github' ? (
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-soft">
                                GitHub Username
                            </label>
                            <div className="relative">
                                <SiGithub className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-soft" />
                                <input
                                    type="text"
                                    value={github}
                                    onChange={(e) => setGithub(e.target.value)}
                                    placeholder="e.g. alice or @alice"
                                    className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-9 font-mono text-xs text-ink ring-1 ring-line/50 ring-inset placeholder:text-soft/60 focus:border-accent focus:outline-hidden"
                                />
                            </div>
                            <p className="mt-1 text-[11px] text-soft">
                                LaraKube fetches their verified public keys
                                directly from GitHub.
                            </p>
                            {(errors.github || pageErrors.github) && (
                                <p className="mt-1 text-xs text-red-500">
                                    {errors.github || pageErrors.github}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-soft">
                                SSH Public Key
                            </label>
                            <textarea
                                value={pubkey}
                                onChange={(e) => setPubkey(e.target.value)}
                                placeholder="ssh-ed25519 AAAAC3... teammate@example.com"
                                rows={4}
                                className="w-full resize-none rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-relaxed text-ink ring-1 ring-line/50 ring-inset placeholder:text-soft/60 focus:border-accent focus:outline-hidden"
                            />
                            {(errors.pubkey || pageErrors.pubkey) && (
                                <p className="mt-1 text-xs text-red-500">
                                    {errors.pubkey || pageErrors.pubkey}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-line pt-4">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            disabled={processing}
                        >
                            <XCircle className="size-3.5" />
                            <span>Cancel</span>
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={processing}
                        >
                            <UserPlus className="size-3.5" />
                            <span>
                                {processing ? 'Granting…' : 'Grant Access'}
                            </span>
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
