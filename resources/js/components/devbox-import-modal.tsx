import { router, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import {
    Download,
    Eye,
    EyeOff,
    FileCode,
    FolderOpen,
    Server,
    X,
    XCircle,
} from 'lucide-react';
import Button from '@/components/button';
import { sendJson } from '@/lib/http';
import { cn } from '@/lib/utils';

export default function DevBoxImportModal({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const page = usePage();
    const pageErrors = (page.props.errors as Record<string, string>) || {};

    const [filePath, setFilePath] = useState('');
    const [fileName, setFileName] = useState('');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [name, setName] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isPickingFile, setIsPickingFile] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handlePickFile = async () => {
        setIsPickingFile(true);
        try {
            const res = await sendJson<{ path: string | null }>(
                '/dev-boxes/pick-bundle',
                'GET',
            );
            if (res.ok && res.data.path) {
                setFilePath(res.data.path);
                const base = res.data.path.split(/[\\/]/).pop() || '';
                setFileName(base);
                setUploadedFile(null);
                if (!name) {
                    setName(base.replace(/\.devbox$/, ''));
                }
                setErrors((prev) => ({ ...prev, file: '' }));
            }
        } finally {
            setIsPickingFile(false);
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadedFile(file);
            setFileName(file.name);
            const electronPath = (file as unknown as { path?: string }).path;
            if (electronPath) {
                setFilePath(electronPath);
            } else {
                setFilePath('');
            }
            if (!name) {
                setName(file.name.replace(/\.devbox$/, ''));
            }
            setErrors((prev) => ({ ...prev, file: '' }));
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            setUploadedFile(file);
            setFileName(file.name);
            const electronPath = (file as unknown as { path?: string }).path;
            if (electronPath) {
                setFilePath(electronPath);
            } else {
                setFilePath('');
            }
            if (!name) {
                setName(file.name.replace(/\.devbox$/, ''));
            }
            setErrors((prev) => ({ ...prev, file: '' }));
        }
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        const formErrors: Record<string, string> = {};
        if (!filePath && !uploadedFile) {
            formErrors.file = 'Please select a .devbox bundle file.';
        }
        if (!passphrase) {
            formErrors.passphrase = 'Please enter the decryption passphrase.';
        }

        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            return;
        }

        setProcessing(true);
        setErrors({});

        if (uploadedFile && !filePath) {
            const formData = new FormData();
            formData.append('bundle', uploadedFile);
            if (name.trim()) formData.append('name', name.trim());
            formData.append('passphrase', passphrase);

            router.post('/dev-boxes/import', formData, {
                onFinish: () => setProcessing(false),
                onError: (errs) => setErrors(errs as Record<string, string>),
                onSuccess: () => {
                    onClose();
                    resetForm();
                },
            });
        } else {
            router.post(
                '/dev-boxes/import',
                {
                    file: filePath,
                    name: name.trim() || undefined,
                    passphrase,
                },
                {
                    onFinish: () => setProcessing(false),
                    onError: (errs) =>
                        setErrors(errs as Record<string, string>),
                    onSuccess: () => {
                        onClose();
                        resetForm();
                    },
                },
            );
        }
    };

    const resetForm = () => {
        setFilePath('');
        setFileName('');
        setUploadedFile(null);
        setName('');
        setPassphrase('');
        setErrors({});
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line">
                <div className="flex items-center justify-between border-b border-line pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                            <Download className="size-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-ink">
                                Import Dev Box
                            </h3>
                            <p className="text-xs text-soft">
                                Restore a dev box from an encrypted .devbox
                                bundle
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
                    {/* Bundle File Selection */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-soft">
                            Bundle File (.devbox)
                        </label>
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            className={cn(
                                'flex flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center transition-colors',
                                isDragging
                                    ? 'border-accent bg-accent/5'
                                    : 'border-line bg-badge/20 hover:border-soft/60',
                            )}
                        >
                            {fileName ? (
                                <div className="flex items-center gap-2 text-sm text-ink">
                                    <FileCode className="size-4 text-accent" />
                                    <span className="max-w-[280px] truncate font-mono text-xs">
                                        {fileName}
                                    </span>
                                </div>
                            ) : (
                                <p className="text-xs text-soft">
                                    Drag &amp; drop your .devbox file here or
                                </p>
                            )}

                            <div className="mt-2.5 flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={isPickingFile}
                                    onClick={handlePickFile}
                                >
                                    <FolderOpen className="size-3.5" />
                                    <span>Browse bundle…</span>
                                </Button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    className="text-xs text-accent hover:underline"
                                >
                                    choose file
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".devbox,application/json"
                                    onChange={handleFileInputChange}
                                    className="hidden"
                                />
                            </div>
                        </div>
                        {(errors.file || pageErrors.file) && (
                            <p className="mt-1 text-xs text-red-500">
                                {errors.file || pageErrors.file}
                            </p>
                        )}
                    </div>

                    {/* Decryption Passphrase */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-soft">
                            Decryption Passphrase
                        </label>
                        <div className="relative">
                            <input
                                type={showPassphrase ? 'text' : 'password'}
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="Enter bundle passphrase"
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

                    {/* Optional Name */}
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-soft">
                            Box Name (Optional)
                        </label>
                        <div className="relative">
                            <Server className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-soft" />
                            <input
                                type="text"
                                value={name}
                                onChange={(e) =>
                                    setName(
                                        e.target.value
                                            .toLowerCase()
                                            .replace(/[^a-z0-9-]/g, ''),
                                    )
                                }
                                placeholder="Leave blank to use original name"
                                className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-9 font-mono text-xs text-ink ring-1 ring-line/50 ring-inset placeholder:text-soft/60 focus:border-accent focus:outline-hidden"
                            />
                        </div>
                        <p className="mt-1 text-[11px] text-soft">
                            Lowercase letters, numbers, and dashes.
                        </p>
                        {(errors.name || pageErrors.name) && (
                            <p className="mt-1 text-xs text-red-500">
                                {errors.name || pageErrors.name}
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
                                {processing ? 'Importing…' : 'Import Dev Box'}
                            </span>
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
