import { useState } from 'react';
import { router } from '@inertiajs/react';
import {
    Plus,
    X,
    ArrowUpCircle,
    RotateCw,
    Sparkles,
    ChevronDown,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import { add, remove } from '@/routes/projects/extensions';
import { up } from '@/routes/projects';
import type { Project } from '@/types/larakube';

const COMMON_PRESETS = [
    'bcmath',
    'gd',
    'imagick',
    'intl',
    'soap',
    'pcntl',
    'redis',
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

    const extensions = project.additionalExtensions ?? [];
    const phpVersion = project.phpVersion || '8.5';
    const serverVariation = project.serverVariation || 'fpm-nginx';

    const availablePresets = COMMON_PRESETS.filter(
        (preset) => !extensions.includes(preset),
    );

    const handleUpdateRuntime = (data: {
        phpVersion?: string;
        serverVariation?: string;
    }) => {
        setUpdatingRuntime(true);
        router.post(`/projects/${project.id}/runtime`, data, {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => setUpdatingRuntime(false),
        });
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
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <div className="relative inline-flex items-center">
                        <select
                            value={phpVersion}
                            disabled={updatingRuntime}
                            onChange={(e) =>
                                handleUpdateRuntime({
                                    phpVersion: e.target.value,
                                })
                            }
                            className="cursor-pointer appearance-none rounded-md bg-brand/10 py-0.5 pr-4 pl-1.5 font-medium text-brand hover:bg-brand/15 focus:ring-1 focus:ring-brand/30 focus:outline-hidden disabled:opacity-50"
                            title="Change PHP Version"
                        >
                            <option value="8.5">PHP 8.5 (Latest)</option>
                            <option value="8.4">PHP 8.4</option>
                            <option value="8.3">PHP 8.3</option>
                            <option value="8.2">PHP 8.2</option>
                            <option value="8.1">PHP 8.1</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1 size-2.5 text-brand" />
                    </div>

                    <div className="relative inline-flex items-center">
                        <select
                            value={serverVariation}
                            disabled={updatingRuntime}
                            onChange={(e) =>
                                handleUpdateRuntime({
                                    serverVariation: e.target.value,
                                })
                            }
                            className="cursor-pointer appearance-none rounded-md bg-line/60 py-0.5 pr-4 pl-1.5 text-soft hover:bg-line/80 focus:ring-1 focus:ring-brand/30 focus:outline-hidden disabled:opacity-50"
                            title="Change Server Variation"
                        >
                            <option value="fpm-nginx">fpm-nginx</option>
                            <option value="frankenphp">frankenphp</option>
                            <option value="fpm-apache">fpm-apache</option>
                            <option value="swoole">swoole</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1 size-2.5 text-soft" />
                    </div>
                </div>
            }
        >
            <div className="space-y-4">
                {/* Active Extensions */}
                <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">
                            Active Extensions
                        </span>
                        <span className="font-mono text-[11px] text-soft">
                            {extensions.length} installed
                        </span>
                    </div>

                    {extensions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-line bg-paper/30 p-3 text-center text-xs text-soft">
                            No custom PHP extensions configured. Standard core
                            modules (PDO, mbstring, cURL) are pre-installed.
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
                        Modifying extensions updates{' '}
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
        </Card>
    );
}
