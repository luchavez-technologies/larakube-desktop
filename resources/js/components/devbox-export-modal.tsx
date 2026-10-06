import { router, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import {
    Download,
    Eye,
    EyeOff,
    Folder,
    Lock,
    Shield,
    X,
    XCircle,
} from 'lucide-react';
import Button from '@/components/button';

export default function DevBoxExportModal({
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

    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [outputPath, setOutputPath] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    if (!isOpen) return null;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        const formErrors: Record<string, string> = {};
        if (!passphrase) {
            formErrors.passphrase = 'Please enter an encryption passphrase.';
        } else if (passphrase.length < 4) {
            formErrors.passphrase = 'Passphrase must be at least 4 characters.';
        } else if (passphrase !== confirmPassphrase) {
            formErrors.confirmPassphrase = 'Passphrases do not match.';
        }

        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            return;
        }

        setProcessing(true);
        setErrors({});

        router.post(
            `/dev-boxes/${box}/export`,
            {
                passphrase,
                output: outputPath.trim() || undefined,
            },
            {
                onFinish: () => setProcessing(false),
                onError: (errs) => setErrors(errs as Record<string, string>),
                onSuccess: () => {
                    onClose();
                    setPassphrase('');
                    setConfirmPassphrase('');
                    setOutputPath('');
                },
            },
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line">
                <div className="flex items-center justify-between border-b border-line pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                            <Lock className="size-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-ink">
                                Export Dev Box
                            </h3>
                            <p className="text-xs text-soft">
                                Encrypt and export{' '}
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
                            Exports the box&apos;s connection metadata and SSH
                            private key as an encrypted{' '}
                            <span className="font-mono text-ink">.devbox</span>{' '}
                            bundle using{' '}
                            <strong className="text-ink">AES-256-GCM</strong>.
                            Saved to your Downloads folder by default.
                        </div>
                    </div>

                    {/* Encryption Passphrase */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-soft">
                            Encryption Passphrase
                        </label>
                        <div className="relative">
                            <input
                                type={showPassphrase ? 'text' : 'password'}
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="Choose a strong passphrase"
                                className="w-full rounded-xl border border-line bg-surface px-3 py-2 pr-10 text-xs text-ink ring-1 ring-line/50 ring-inset placeholder:text-soft/60 focus:border-accent focus:outline-hidden"
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setShowPassphrase(!showPassphrase)
                                }
                                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-soft hover:text-ink"
                            >
                                {showPassphrase ? (
                                    <EyeOff className="size-3.5" />
                                ) : (
                                    <Eye className="size-3.5" />
                                )}
                            </button>
                        </div>
                        {(errors.passphrase || pageErrors.passphrase) && (
                            <p className="mt-1 text-xs text-red-500">
                                {errors.passphrase || pageErrors.passphrase}
                            </p>
                        )}
                    </div>

                    {/* Confirm Passphrase */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-soft">
                            Confirm Passphrase
                        </label>
                        <input
                            type={showPassphrase ? 'text' : 'password'}
                            value={confirmPassphrase}
                            onChange={(e) =>
                                setConfirmPassphrase(e.target.value)
                            }
                            placeholder="Repeat passphrase"
                            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink ring-1 ring-line/50 ring-inset placeholder:text-soft/60 focus:border-accent focus:outline-hidden"
                        />
                        {errors.confirmPassphrase && (
                            <p className="mt-1 text-xs text-red-500">
                                {errors.confirmPassphrase}
                            </p>
                        )}
                    </div>

                    {/* Custom Output Path */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-soft">
                            Output File Path (Optional)
                        </label>
                        <div className="relative">
                            <Folder className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-soft" />
                            <input
                                type="text"
                                value={outputPath}
                                onChange={(e) => setOutputPath(e.target.value)}
                                placeholder={`Default: Downloads/${box}.devbox`}
                                className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-9 font-mono text-xs text-ink ring-1 ring-line/50 ring-inset placeholder:text-soft/60 focus:border-accent focus:outline-hidden"
                            />
                        </div>
                        {(errors.output || pageErrors.output) && (
                            <p className="mt-1 text-xs text-red-500">
                                {errors.output || pageErrors.output}
                            </p>
                        )}
                    </div>

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
                            <Download className="size-3.5" />
                            <span>
                                {processing ? 'Exporting…' : 'Export Dev Box'}
                            </span>
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
