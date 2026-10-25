import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import {
    Plus,
    X,
    ArrowUpCircle,
    RotateCw,
    Sparkles,
    Save,
    XCircle,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { add, remove } from '@/routes/projects/extensions';
import { up } from '@/routes/projects';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/larakube';

const COMMON_PRESETS = [
    'bcmath',
    'gd',
    'imagick',
    'intl',
    'soap',
    'pcntl',
    'zip',
    'mongodb',
    'opcache',
];

export default function PhpExtensionsCard({
    project,
    activeEnv = 'local',
}: {
    project: Project;
    activeEnv?: string;
}) {
    const [customExt, setCustomExt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [removingExt, setRemovingExt] = useState<string | null>(null);
    const [rebuilding, setRebuilding] = useState(false);
    const [updatingRuntime, setUpdatingRuntime] = useState(false);
    const [confirmRuntimeOpen, setConfirmRuntimeOpen] = useState(false);

    const extensions = project.additionalExtensions ?? [];
    const phpVersion = project.phpVersion || '8.5';
    const serverVariation = project.serverVariation || 'fpm-nginx';

    const [selectedPhp, setSelectedPhp] = useState(phpVersion);
    const [selectedServer, setSelectedServer] = useState(serverVariation);

    useEffect(() => {
        setSelectedPhp(phpVersion);
    }, [phpVersion]);

    useEffect(() => {
        setSelectedServer(serverVariation);
    }, [serverVariation]);

    const isRuntimeDirty =
        selectedPhp !== phpVersion || selectedServer !== serverVariation;

    const availablePresets = COMMON_PRESETS.filter(
        (preset) => !extensions.includes(preset),
    );

    const handleSaveRuntime = () => {
        setUpdatingRuntime(true);
        router.post(
            `/projects/${project.id}/runtime`,
            {
                phpVersion: selectedPhp,
                serverVariation: selectedServer,
                environment: activeEnv,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setUpdatingRuntime(false);
                    setConfirmRuntimeOpen(false);
                },
            },
        );
    };

    const handleAdd = (extToAdd?: string) => {
        const raw = extToAdd || customExt;
        const normalized = raw.trim().toLowerCase();
        if (!normalized || submitting) return;

        setSubmitting(true);
        router.post(
            add(project.id).url,
            { extension: normalized },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setSubmitting(false);
                    if (!extToAdd) setCustomExt('');
                },
            },
        );
    };

    const handleRemove = (ext: string) => {
        if (submitting || removingExt) return;

        setRemovingExt(ext);
        router.post(
            remove(project.id).url,
            { extension: ext },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setRemovingExt(null),
            },
        );
    };

    const handleRebuild = () => {
        setRebuilding(true);
        router.post(
            up(project.id).url,
            { environment: activeEnv },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setRebuilding(false),
            },
        );
    };

    return (
        <Card
            label="PHP Runtime & Extensions"
            action={
                <span className="font-mono text-[11px] text-soft">
                    {extensions.length} installed
                </span>
            }
        >
            <div className="space-y-4">
                {/* Runtime Configuration Panel */}
                <div className="rounded-xl border border-line bg-paper/50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">
                            Runtime Configuration
                        </span>
                        {isRuntimeDirty && (
                            <span className="font-mono text-[10px] font-medium text-warn">
                                Unsaved changes
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="mb-1 block text-[11px] text-soft">
                                PHP Version
                            </label>
                            <select
                                value={selectedPhp}
                                disabled={updatingRuntime}
                                onChange={(e) => setSelectedPhp(e.target.value)}
                                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-xs text-ink focus:border-brand focus:outline-hidden"
                            >
                                <option value="8.5">PHP 8.5 (Latest)</option>
                                <option value="8.4">PHP 8.4</option>
                                <option value="8.3">PHP 8.3</option>
                                <option value="8.2">PHP 8.2</option>
                                <option value="8.1">PHP 8.1</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] text-soft">
                                Server
                            </label>
                            <select
                                value={selectedServer}
                                disabled={updatingRuntime}
                                onChange={(e) =>
                                    setSelectedServer(e.target.value)
                                }
                                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-xs text-ink focus:border-brand focus:outline-hidden"
                            >
                                <option value="fpm-nginx">fpm-nginx</option>
                                <option value="frankenphp">frankenphp</option>
                                <option value="fpm-apache">fpm-apache</option>
                            </select>
                        </div>
                    </div>

                    {isRuntimeDirty && (
                        <div className="mt-3 flex items-center justify-end gap-2 border-t border-line/60 pt-2.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={updatingRuntime}
                                onClick={() => {
                                    setSelectedPhp(phpVersion);
                                    setSelectedServer(serverVariation);
                                }}
                                className="h-7 gap-1 px-2.5 text-xs"
                            >
                                <XCircle className="size-3" />
                                <span>Reset</span>
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={updatingRuntime}
                                onClick={() => setConfirmRuntimeOpen(true)}
                                className="h-7 gap-1.5 px-2.5 text-xs"
                            >
                                <Save className="size-3 text-brand" />
                                <span>Save Runtime</span>
                            </Button>
                        </div>
                    )}
                </div>

                {/* Active Extensions */}
                <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">
                            Active Extensions
                        </span>
                    </div>

                    {extensions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-line bg-paper/30 p-3 text-center text-xs text-soft">
                            No custom PHP extensions configured. Standard core
                            modules (PDO, mbstring, Redis, cURL) are
                            pre-installed in the SSU image.
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {extensions.map((ext) => (
                                <span
                                    key={ext}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1 pr-1.5 pl-2 font-mono text-xs font-medium text-ink shadow-2xs"
                                >
                                    <span>{ext}</span>
                                    <button
                                        type="button"
                                        disabled={
                                            submitting || removingExt === ext
                                        }
                                        onClick={() => handleRemove(ext)}
                                        className="rounded p-0.5 text-soft transition hover:bg-accent-tint hover:text-accent disabled:opacity-50"
                                        title={`Remove ${ext}`}
                                    >
                                        {removingExt === ext ? (
                                            <RotateCw className="size-3 animate-spin" />
                                        ) : (
                                            <X className="size-3" />
                                        )}
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Popular Presets */}
                {availablePresets.length > 0 && (
                    <div>
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-soft">
                            <Sparkles className="size-3 text-brand" />
                            <span>Quick Add Presets</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {availablePresets.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    disabled={submitting}
                                    onClick={() => handleAdd(preset)}
                                    className="inline-flex items-center gap-1 rounded-md border border-line bg-paper/50 px-2 py-0.5 font-mono text-[11px] text-soft transition hover:border-brand/40 hover:bg-paper hover:text-ink disabled:opacity-50"
                                    title={`Add ${preset} extension`}
                                >
                                    <Plus className="size-2.5 text-brand" />
                                    <span>{preset}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Extension Input */}
                <div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleAdd();
                        }}
                        className="flex items-center gap-2"
                    >
                        <input
                            type="text"
                            placeholder="Add extension (e.g. grpc, sodium)"
                            value={customExt}
                            onChange={(e) => setCustomExt(e.target.value)}
                            disabled={submitting}
                            className="h-8 flex-1 rounded-lg border border-line bg-surface px-3 font-mono text-xs text-ink placeholder:text-soft focus:border-brand focus:outline-hidden"
                        />
                        <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            disabled={submitting || !customExt.trim()}
                            className="gap-1 text-xs"
                            title="Add custom PHP extension"
                        >
                            {submitting ? (
                                <RotateCw className="size-3 animate-spin" />
                            ) : (
                                <Plus className="size-3" />
                            )}
                            <span>Add</span>
                        </Button>
                    </form>
                </div>

                {/* Rebuild image prompt */}
                <div className="rounded-xl border border-line bg-paper/40 p-3">
                    <p className="text-[11px] leading-relaxed text-soft">
                        Modifying runtime or extensions updates{' '}
                        <code className="font-mono text-ink">
                            Dockerfile.php
                        </code>
                        . Rebuild the environment image to apply changes.
                    </p>
                    <div className="mt-2.5">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={rebuilding}
                            onClick={handleRebuild}
                            className="w-full justify-center gap-1.5 text-xs"
                            title="Rebuild container image with current extensions"
                        >
                            <ArrowUpCircle className="size-3.5 text-brand" />
                            <span>
                                {rebuilding
                                    ? 'Rebuilding…'
                                    : 'Rebuild / Up Image'}
                            </span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal for PHP Runtime */}
            {confirmRuntimeOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="flex items-start gap-3.5">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                                <Save className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-ink">
                                    Update PHP Runtime?
                                </h3>
                                <p className="mt-1.5 text-xs leading-relaxed text-soft">
                                    Updating runtime to{' '}
                                    <span className="font-semibold text-ink">
                                        PHP {selectedPhp} ({selectedServer})
                                    </span>{' '}
                                    will rewrite your{' '}
                                    <code className="font-mono text-ink">
                                        Dockerfile.php
                                    </code>{' '}
                                    and auto-heal your Kubernetes manifests.
                                </p>
                                <div className="mt-3 rounded-lg border border-warn/30 bg-warn-tint/60 p-2.5 text-xs font-medium text-ink">
                                    A project Rebuild / Up is needed for changes
                                    to take effect in your cluster.
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-2.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={updatingRuntime}
                                onClick={() => setConfirmRuntimeOpen(false)}
                                className="gap-1.5 text-xs"
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={updatingRuntime}
                                onClick={handleSaveRuntime}
                                className="gap-1.5 text-xs"
                            >
                                <Save
                                    className={cn(
                                        'size-3.5',
                                        updatingRuntime && 'animate-spin',
                                    )}
                                />
                                <span>
                                    {updatingRuntime
                                        ? 'Saving…'
                                        : 'Save & Auto-Heal'}
                                </span>
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
