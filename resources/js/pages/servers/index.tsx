import { useState, useEffect, useRef } from 'react';
import { Deferred, Link, Form } from '@inertiajs/react';
import {
    Plus,
    ChevronRight,
    FileUp,
    FolderOpen,
    UploadCloud,
    CheckCircle2,
    X,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import StatusPill from '@/components/status-pill';
import ViewToggle, { type ViewMode } from '@/components/view-toggle';
import AppLayout from '@/layouts/app-layout';
import { serverStatus } from '@/lib/servers';
import { create, show } from '@/routes/servers';
import { providerLabels } from '@/types/larakube';
import type { Server } from '@/types/larakube';

export default function ServersIndex({
    servers,
}: {
    servers?: Server[] | null;
}) {
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [showImport, setShowImport] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('larakube_view_mode_servers');
        if (saved === 'cards' || saved === 'table') {
            setViewMode(saved);
        }
    }, []);

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        localStorage.setItem('larakube_view_mode_servers', mode);
    };

    const leftovers =
        servers?.filter((server) => server.status !== 'ready') ?? [];

    return (
        <AppLayout title="Servers">
            <header className="mb-5 flex items-center justify-between gap-6">
                <div>
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
                        Servers
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                        Kubernetes servers you created with LaraKube. Each one
                        runs k3s and can host Cluster Tools and your apps.
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <ViewToggle
                        mode={viewMode}
                        onChange={handleViewModeChange}
                    />
                    <Button
                        variant="secondary"
                        onClick={() => setShowImport(true)}
                        className="gap-2"
                    >
                        <FileUp className="size-4" />
                        <span>Import Kubeconfig</span>
                    </Button>
                    <Link
                        href={create().url}
                        className={buttonClass('primary')}
                    >
                        <Plus className="size-4" />
                        <span>Create server</span>
                    </Link>
                </div>
            </header>

            <Deferred
                data="servers"
                fallback={
                    <div className="h-56 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {servers === null ? (
                    <p className="text-sm text-soft">
                        Couldn't read your servers from the LaraKube CLI. Finish
                        Setup, or update the CLI.
                    </p>
                ) : servers?.length === 0 ? (
                    <EmptyState />
                ) : (
                    <>
                        {viewMode === 'table' ? (
                            /* Table View */
                            <div className="overflow-hidden rounded-2xl bg-surface px-5.5 ring-1 ring-line ring-inset">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="text-[11px] tracking-[0.06em] text-soft uppercase">
                                            {[
                                                'Name',
                                                'Provider',
                                                'Region',
                                                'IP address',
                                                'Status',
                                                '',
                                            ].map((heading) => (
                                                <th
                                                    key={heading}
                                                    className="py-3 font-medium"
                                                >
                                                    {heading}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {servers?.map((server) => {
                                            const [label, tone] =
                                                serverStatus[server.status];

                                            return (
                                                <tr
                                                    key={server.name}
                                                    className="border-t border-line"
                                                >
                                                    <td className="py-3.5 font-medium">
                                                        <Link
                                                            href={
                                                                show(
                                                                    server.name,
                                                                ).url
                                                            }
                                                            className="font-semibold hover:underline"
                                                        >
                                                            {server.name}
                                                        </Link>
                                                    </td>
                                                    <td className="text-soft">
                                                        <div className="flex items-center gap-1.5">
                                                            <span>
                                                                {providerLabels[
                                                                    server
                                                                        .provider
                                                                ] ??
                                                                    server.provider}
                                                            </span>
                                                            {server.kind ===
                                                                'discovered' && (
                                                                <span className="rounded bg-badge px-1.5 py-0.5 text-[10px] font-semibold text-soft">
                                                                    Discovered
                                                                </span>
                                                            )}
                                                            {server.isCurrent && (
                                                                <span className="rounded bg-ok-tint px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                                                                    Active
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="font-mono text-[13px] text-soft">
                                                        {server.region ?? '—'}
                                                    </td>
                                                    <td className="font-mono text-[13px]">
                                                        {server.ip ?? '—'}
                                                    </td>
                                                    <td>
                                                        <StatusPill tone={tone}>
                                                            {label}
                                                        </StatusPill>
                                                    </td>
                                                    <td className="text-right">
                                                        <Link
                                                            href={
                                                                show(
                                                                    server.name,
                                                                ).url
                                                            }
                                                            className="inline-flex p-1 text-faint transition-colors hover:text-ink"
                                                            aria-label={`Open ${server.name}`}
                                                        >
                                                            <ChevronRight className="size-4" />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            /* Card Grid View */
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                                {servers?.map((server) => {
                                    const [label, tone] =
                                        serverStatus[server.status];

                                    return (
                                        <Link
                                            key={server.name}
                                            href={show(server.name).url}
                                            className="rounded-xl bg-surface p-4 ring-1 ring-line transition-all ring-inset hover:ring-faint"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="truncate text-sm font-semibold">
                                                    {server.name}
                                                </span>
                                                <StatusPill tone={tone}>
                                                    {label}
                                                </StatusPill>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-soft">
                                                <span>
                                                    {providerLabels[
                                                        server.provider
                                                    ] ?? server.provider}
                                                </span>
                                                {server.kind ===
                                                    'discovered' && (
                                                    <span className="rounded bg-badge px-1.5 py-0.5 text-[10px] font-semibold text-soft">
                                                        Discovered
                                                    </span>
                                                )}
                                                {server.isCurrent && (
                                                    <span className="rounded bg-ok-tint px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                                                        Active
                                                    </span>
                                                )}
                                                {server.region && (
                                                    <span>
                                                        · {server.region}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between">
                                                <span className="font-mono text-[11px] text-faint">
                                                    {server.ip ??
                                                        'Provisioning IP…'}
                                                </span>
                                                <span className="text-sm font-medium text-brand hover:underline">
                                                    View →
                                                </span>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                        {leftovers.length > 0 && (
                            <p className="mt-3 rounded-[10px] bg-warn-tint px-3.5 py-2.5 text-[13px] text-warn">
                                {leftovers
                                    .map((server) => server.name)
                                    .join(', ')}{' '}
                                stopped partway through. Anything the provider
                                already created is still tracked, so open it to
                                destroy the leftovers.
                            </p>
                        )}
                    </>
                )}
            </Deferred>

            {showImport && (
                <ImportKubeconfigModal onClose={() => setShowImport(false)} />
            )}
        </AppLayout>
    );
}

function EmptyState() {
    return (
        <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
            <p className="text-lg font-semibold tracking-[-0.015em]">
                No servers yet
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-soft">
                Create one to host Cluster Tools and your Laravel apps. It takes
                about 5 minutes.
            </p>
            <Link
                href={create().url}
                className={buttonClass('primary', 'md', 'mt-5')}
            >
                Create server
            </Link>
        </div>
    );
}

function ImportKubeconfigModal({ onClose }: { onClose: () => void }) {
    const [tab, setTab] = useState<'file' | 'raw'>('file');
    const [filePath, setFilePath] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [rawContent, setRawContent] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isPicking, setIsPicking] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function triggerNativePicker() {
        setIsPicking(true);
        try {
            const res = await fetch('/context/pick-file', {
                headers: { Accept: 'application/json' },
            });
            if (res.ok) {
                const data = (await res.json()) as { path: string | null };
                if (data.path) {
                    setFilePath(data.path);
                    setFileName(data.path.split('/').pop() || data.path);
                    setFileSize(null);
                    return;
                }
            }
        } catch {
            // Fallback to HTML input
        } finally {
            setIsPicking(false);
        }

        // If native dialog returned null or was unavailable, click file input as fallback
        fileInputRef.current?.click();
    }

    async function handleFile(file: File) {
        setFileName(file.name);
        setFileSize(file.size);

        // In Electron, File objects provide an absolute 'path'
        const electronPath = (file as unknown as { path?: string }).path;
        if (electronPath) {
            setFilePath(electronPath);
        }

        try {
            const text = await file.text();
            setRawContent(text);
        } catch {
            // ignore
        }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            void handleFile(file);
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            void handleFile(file);
        }
    }

    function clearSelection() {
        setFilePath('');
        setFileName('');
        setFileSize(null);
        setRawContent('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }

    const hasSelection = Boolean(filePath || fileName || rawContent);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-line">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-ink">
                        Import Kubernetes Context
                    </h3>
                    <div className="flex rounded-lg bg-badge p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setTab('file')}
                            className={`rounded-md px-2.5 py-1 font-medium transition ${
                                tab === 'file'
                                    ? 'bg-surface text-ink shadow-2xs'
                                    : 'text-soft hover:text-ink'
                            }`}
                        >
                            Choose File
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('raw')}
                            className={`rounded-md px-2.5 py-1 font-medium transition ${
                                tab === 'raw'
                                    ? 'bg-surface text-ink shadow-2xs'
                                    : 'text-soft hover:text-ink'
                            }`}
                        >
                            Paste YAML
                        </button>
                    </div>
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-soft">
                    Imports and flattens a cluster kubeconfig into your local{' '}
                    <code className="font-mono text-ink">~/.kube/config</code>,
                    making it instantly manageable in LaraKube.
                </p>

                <Form action="/context/import" className="mt-4 space-y-4">
                    {({ processing, errors }) => (
                        <>
                            {/* Hidden file input for web or fallback file picking */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".yaml,.yml,.kubeconfig,.conf,.config,text/yaml,text/plain"
                                onChange={handleFileChange}
                                className="hidden"
                            />

                            {tab === 'raw' ? (
                                <label className="block">
                                    <span className="mb-1.5 block text-xs font-medium text-soft">
                                        Kubeconfig YAML
                                    </span>
                                    <textarea
                                        name="content"
                                        value={rawContent}
                                        onChange={(e) =>
                                            setRawContent(e.target.value)
                                        }
                                        placeholder={`apiVersion: v1\nclusters:\n  - cluster:\n      server: https://...\n...`}
                                        rows={8}
                                        autoFocus
                                        required
                                        className="w-full rounded-lg border-0 bg-paper p-3 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                    />
                                    {errors.content && (
                                        <span className="mt-1 block text-xs text-accent">
                                            {errors.content}
                                        </span>
                                    )}
                                </label>
                            ) : (
                                <div className="space-y-3">
                                    <input
                                        type="hidden"
                                        name="file"
                                        value={filePath}
                                    />
                                    <input
                                        type="hidden"
                                        name="content"
                                        value={rawContent}
                                    />

                                    {hasSelection ? (
                                        <div className="flex items-center justify-between rounded-xl border border-line bg-paper p-3.5 shadow-2xs">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                                                    <CheckCircle2 className="size-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-medium text-ink">
                                                        {fileName ||
                                                            filePath
                                                                .split('/')
                                                                .pop()}
                                                    </p>
                                                    <p className="truncate font-mono text-[11px] text-soft">
                                                        {filePath ||
                                                            (fileSize
                                                                ? `${(fileSize / 1024).toFixed(1)} KB`
                                                                : 'Ready to import')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={
                                                        triggerNativePicker
                                                    }
                                                    disabled={isPicking}
                                                >
                                                    <FolderOpen className="size-3.5" />
                                                    <span>Change</span>
                                                </Button>
                                                <button
                                                    type="button"
                                                    onClick={clearSelection}
                                                    className="hover:text-danger rounded-lg p-1.5 text-soft transition"
                                                    title="Clear file"
                                                >
                                                    <X className="size-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={triggerNativePicker}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setIsDragging(true);
                                            }}
                                            onDragLeave={() =>
                                                setIsDragging(false)
                                            }
                                            onDrop={handleDrop}
                                            className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                                                isDragging
                                                    ? 'border-brand bg-brand/5'
                                                    : 'border-line hover:border-brand/40 hover:bg-surface/50'
                                            }`}
                                        >
                                            <div className="flex size-11 items-center justify-center rounded-xl bg-badge ring-1 ring-line transition-transform group-hover:scale-105">
                                                <UploadCloud className="size-5 text-brand" />
                                            </div>
                                            <p className="mt-2.5 text-xs font-semibold text-ink">
                                                Choose a kubeconfig file or drag
                                                & drop here
                                            </p>
                                            <p className="mt-1 text-[11px] text-soft">
                                                Supports .yaml, .yml,
                                                .kubeconfig, or .conf
                                            </p>
                                            <div className="mt-3.5">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void triggerNativePicker();
                                                    }}
                                                    disabled={isPicking}
                                                >
                                                    <FolderOpen className="size-3.5" />
                                                    <span>
                                                        {isPicking
                                                            ? 'Opening picker…'
                                                            : 'Browse Files…'}
                                                    </span>
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Manual path entry disclosure */}
                                    <div className="pt-1">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowManual(!showManual)
                                            }
                                            className="text-[11px] font-medium text-soft transition hover:text-ink"
                                        >
                                            {showManual
                                                ? '— Hide manual file path input'
                                                : '+ Or type / paste absolute path'}
                                        </button>
                                        {showManual && (
                                            <div className="mt-2">
                                                <input
                                                    type="text"
                                                    value={filePath}
                                                    onChange={(e) => {
                                                        setFilePath(
                                                            e.target.value,
                                                        );
                                                        setFileName(
                                                            e.target.value
                                                                .split('/')
                                                                .pop() || '',
                                                        );
                                                    }}
                                                    placeholder="/Users/name/.kube/custom-cluster.yaml"
                                                    className="w-full rounded-lg border-0 bg-paper px-3 py-2 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {errors.file && (
                                        <span className="mt-1 block text-xs text-accent">
                                            {errors.file}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-2.5 pt-2">
                                <Button variant="secondary" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        processing ||
                                        (tab === 'raw'
                                            ? rawContent.trim() === ''
                                            : !filePath.trim() &&
                                              !rawContent.trim())
                                    }
                                >
                                    {processing
                                        ? 'Importing…'
                                        : 'Import Context'}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </div>
    );
}
