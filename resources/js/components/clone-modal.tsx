import { router, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import {
    Folder,
    GitBranch,
    GitFork,
    Laptop,
    Server,
    X,
    XCircle,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import { sendJson } from '@/lib/http';
import { cn } from '@/lib/utils';

export default function CloneModal({
    isOpen,
    onClose,
    devBoxes = [],
    initialBox = null,
    defaultParent = '',
}: {
    isOpen: boolean;
    onClose: () => void;
    devBoxes?: string[];
    initialBox?: string | null;
    defaultParent?: string;
}) {
    const page = usePage();
    const pageErrors = (page.props.errors as Record<string, string>) || {};

    const [box, setBox] = useState<string>(initialBox ?? '');
    const [repo, setRepo] = useState('');
    const [directory, setDirectory] = useState('');
    const [hasCustomDirectory, setHasCustomDirectory] = useState(false);
    const [branch, setBranch] = useState('');
    const [parent, setParent] = useState(defaultParent);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isPickingFolder, setIsPickingFolder] = useState(false);

    // Sync box selection whenever modal opens or initialBox changes
    useEffect(() => {
        if (isOpen) {
            setBox(initialBox ?? '');
            setErrors({});
        }
    }, [isOpen, initialBox]);

    // Derive directory name from repo URL if not manually modified
    const deriveDirectoryName = (url: string): string => {
        const clean = url.trim().replace(/\/+$/, '');
        if (!clean) return '';
        const base = clean.split('/').pop() || '';
        return base.replace(/\.git$/, '');
    };

    const handleRepoChange = (value: string) => {
        setRepo(value);
        if (!hasCustomDirectory) {
            setDirectory(deriveDirectoryName(value));
        }
    };

    const handleDirectoryChange = (value: string) => {
        setDirectory(value);
        setHasCustomDirectory(value.trim() !== '');
    };

    const handlePickFolder = async () => {
        setIsPickingFolder(true);
        try {
            const res = await sendJson<{ path: string | null }>(
                '/projects/pick-folder',
                'POST',
            );
            if (res.ok && res.data.path) {
                setParent(res.data.path);
            } else if (res.data.message) {
                setErrors((prev) => ({ ...prev, parent: res.data.message! }));
            }
        } finally {
            setIsPickingFolder(false);
        }
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!repo.trim()) {
            setErrors({ repo: 'Please enter a repository URL or shorthand.' });
            return;
        }

        setProcessing(true);
        setErrors({});

        const isDevBox = Boolean(box);
        const url = isDevBox ? '/projects/clone/dev-box' : '/projects/clone';
        const payload = isDevBox
            ? {
                  repo: repo.trim(),
                  box,
                  directory: directory.trim() || undefined,
                  branch: branch.trim() || undefined,
              }
            : {
                  repo: repo.trim(),
                  directory: directory.trim() || undefined,
                  branch: branch.trim() || undefined,
                  parent: parent || undefined,
              };

        router.post(url, payload, {
            preserveScroll: true,
            onSuccess: () => {
                setProcessing(false);
                onClose();
            },
            onError: (errs) => {
                setProcessing(false);
                setErrors(errs);
            },
        });
    };

    if (!isOpen) {
        return null;
    }

    const onBox = Boolean(box);
    const activeErrors = { ...pageErrors, ...errors };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clone-modal-title"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Dialog Card */}
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-line">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
                    <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand shadow-2xs">
                            <GitBranch className="size-5" />
                        </span>
                        <div>
                            <h2
                                id="clone-modal-title"
                                className="text-base font-semibold text-ink"
                            >
                                Clone repository
                            </h2>
                            <p className="text-xs text-soft">
                                Clone a web project and prepare it with LaraKube
                                CLI.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft transition-colors hover:bg-paper hover:text-ink"
                        aria-label="Close"
                    >
                        <X className="size-4.5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    {/* Location selector (only if dev boxes are available) */}
                    {devBoxes.length > 0 && (
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-ink">
                                Where do you want to clone it?
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBox('')}
                                    className={cn(
                                        'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition',
                                        !box
                                            ? 'bg-ink text-surface shadow-xs'
                                            : 'bg-surface text-ink ring-1 ring-line hover:bg-paper',
                                    )}
                                >
                                    <Laptop className="size-4 shrink-0" />
                                    <span>This computer</span>
                                </button>
                                {devBoxes.map((devBoxName) => (
                                    <button
                                        key={devBoxName}
                                        type="button"
                                        onClick={() => setBox(devBoxName)}
                                        className={cn(
                                            'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition',
                                            box === devBoxName
                                                ? 'bg-ink text-surface shadow-xs'
                                                : 'bg-surface text-ink ring-1 ring-line hover:bg-paper',
                                        )}
                                    >
                                        <Server className="size-4 shrink-0" />
                                        <span className="truncate">
                                            {devBoxName}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {activeErrors.box && (
                                <p className="mt-1 text-xs text-accent">
                                    {activeErrors.box}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Repository URL input */}
                    <div>
                        <label
                            htmlFor="clone-repo-url"
                            className="mb-1 block text-xs font-medium text-ink"
                        >
                            Repository URL or shorthand{' '}
                            <span className="text-accent">*</span>
                        </label>
                        <input
                            id="clone-repo-url"
                            type="text"
                            value={repo}
                            onChange={(e) => handleRepoChange(e.target.value)}
                            placeholder="e.g. laravel/laravel or https://github.com/..."
                            autoFocus
                            className={cn(
                                'w-full rounded-xl bg-paper px-3 py-2 font-mono text-xs text-ink ring-1 ring-line placeholder:text-soft focus:ring-2 focus:ring-brand focus:outline-hidden',
                                activeErrors.repo && 'ring-accent',
                            )}
                        />
                        {activeErrors.repo ? (
                            <p className="mt-1 text-xs text-accent">
                                {activeErrors.repo}
                            </p>
                        ) : (
                            <p className="mt-1 text-[11px] text-faint">
                                Accepts GitHub/GitLab HTTPS URLs, SSH URLs, or{' '}
                                <code>owner/repo</code> shorthand.
                            </p>
                        )}
                    </div>

                    {/* Directory Name */}
                    <div>
                        <label
                            htmlFor="clone-dir-name"
                            className="mb-1 block text-xs font-medium text-ink"
                        >
                            Folder name
                        </label>
                        <input
                            id="clone-dir-name"
                            type="text"
                            value={directory}
                            onChange={(e) =>
                                handleDirectoryChange(e.target.value)
                            }
                            placeholder="my-app"
                            className={cn(
                                'w-full rounded-xl bg-paper px-3 py-2 font-mono text-xs text-ink ring-1 ring-line placeholder:text-soft focus:ring-2 focus:ring-brand focus:outline-hidden',
                                activeErrors.directory && 'ring-accent',
                            )}
                        />
                        {activeErrors.directory && (
                            <p className="mt-1 text-xs text-accent">
                                {activeErrors.directory}
                            </p>
                        )}
                    </div>

                    {/* Path Preview / Folder Selector */}
                    <div>
                        <label className="mb-1 block text-xs font-medium text-ink">
                            Destination path
                        </label>
                        {onBox ? (
                            <p className="rounded-xl bg-paper/60 px-3 py-2 font-mono text-xs text-soft ring-1 ring-line ring-inset">
                                ~/projects/
                                <span className="font-semibold text-ink">
                                    {directory || 'app'}
                                </span>{' '}
                                on <span className="text-ink">{box}</span>
                            </p>
                        ) : (
                            <div className="flex items-center gap-2">
                                <p className="min-w-0 flex-1 truncate rounded-xl bg-paper/60 px-3 py-2 font-mono text-xs text-soft ring-1 ring-line ring-inset">
                                    {parent || '~'}
                                    <span className="text-faint">/</span>
                                    <span className="font-semibold text-ink">
                                        {directory || 'app'}
                                    </span>
                                </p>
                                <button
                                    type="button"
                                    onClick={handlePickFolder}
                                    disabled={isPickingFolder}
                                    className={cn(
                                        buttonClass('secondary', 'sm'),
                                        'shrink-0',
                                    )}
                                >
                                    <Folder className="size-3.5" />
                                    <span>
                                        {isPickingFolder
                                            ? 'Choosing…'
                                            : 'Change…'}
                                    </span>
                                </button>
                            </div>
                        )}
                        {activeErrors.parent && (
                            <p className="mt-1 text-xs text-accent">
                                {activeErrors.parent}
                            </p>
                        )}
                    </div>

                    {/* Branch (Optional) */}
                    <div>
                        <label
                            htmlFor="clone-branch"
                            className="mb-1 block text-xs font-medium text-ink"
                        >
                            Branch{' '}
                            <span className="font-normal text-soft">
                                (optional)
                            </span>
                        </label>
                        <div className="relative">
                            <GitFork className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-soft" />
                            <input
                                id="clone-branch"
                                type="text"
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                placeholder="default branch"
                                className="w-full rounded-xl bg-paper py-2 pr-3 pl-9 font-mono text-xs text-ink ring-1 ring-line placeholder:text-soft focus:ring-2 focus:ring-brand focus:outline-hidden"
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-2.5 border-t border-line pt-3">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            disabled={processing}
                        >
                            <XCircle className="size-4" />
                            <span>Cancel</span>
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={processing || !repo.trim()}
                        >
                            <GitBranch className="size-4" />
                            <span>
                                {processing ? 'Starting…' : 'Clone repository'}
                            </span>
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
