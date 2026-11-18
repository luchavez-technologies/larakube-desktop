import { useRef, useState } from 'react';
import { Globe, Lock, Plus, RotateCw, Search, Trash2, X } from 'lucide-react';
import Button from '@/components/button';
import InfoTooltip from '@/components/info-tooltip';
import StatusPill from '@/components/status-pill';
import { cn } from '@/lib/utils';

export type EnvTableRow = {
    key: string;
    value: string | null;
    isSecret: boolean;
    status?: string;
    isExcluded?: boolean;
    clusterValue?: string | null;
};

export type DraftEnvRow = {
    id: string;
    key: string;
    value: string;
    isSecret: boolean;
    secretTouched?: boolean;
};

export type StagedEnvChange = {
    value: string | null;
    isSecret: boolean;
};

let draftCounter = 0;

export function createDraftRow(
    overrides: Partial<DraftEnvRow> = {},
): DraftEnvRow {
    draftCounter += 1;

    return {
        id: `draft-${draftCounter}`,
        key: '',
        value: '',
        isSecret: false,
        secretTouched: false,
        ...overrides,
    };
}

export function normalizeEnvKey(raw: string): string {
    return raw.trim().toUpperCase().replace(/\s+/g, '_');
}

export function inferIsSecretKey(key: string): boolean {
    const upper = key.toUpperCase();

    return (
        upper.includes('SECRET') ||
        upper.includes('KEY') ||
        upper.includes('PASSWORD') ||
        upper.includes('PASS') ||
        upper.includes('TOKEN') ||
        upper.includes('PRIVATE') ||
        upper.includes('DSN') ||
        upper.includes('CREDENTIAL')
    );
}

/**
 * Parse `KEY=value` lines from pasted `.env` content, ignoring blank lines,
 * comments, optional `export ` prefixes, and matching surrounding quotes.
 */
export function parseDotenv(
    text: string,
): Array<{ key: string; value: string; isSecret: boolean }> {
    const entries: Array<{ key: string; value: string; isSecret: boolean }> =
        [];

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim().replace(/^export\s+/, '');
        const equals = line.indexOf('=');
        if (line === '' || line.startsWith('#') || equals <= 0) {
            continue;
        }

        const rawKey = line.slice(0, equals).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawKey)) {
            continue;
        }

        const key = normalizeEnvKey(rawKey);
        let value = line.slice(equals + 1).trim();
        if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")))
        ) {
            value = value.slice(1, -1);
        }

        if (key !== '') {
            entries.push({
                key,
                value,
                isSecret: inferIsSecretKey(key),
            });
        }
    }

    return entries;
}

const FALLBACK_BLANK_ROW: DraftEnvRow = {
    id: 'draft-initial',
    key: '',
    value: '',
    isSecret: false,
    secretTouched: false,
};

function ensureTrailingBlank(rows: DraftEnvRow[]): DraftEnvRow[] {
    if (rows.length === 0) {
        return [createDraftRow()];
    }

    const last = rows[rows.length - 1];
    if (last.key.trim() !== '' || last.value !== '') {
        return [...rows, createDraftRow()];
    }

    return rows;
}

function isDriftStatus(
    status?: string,
    isSecret = false,
    isLocalEnv = false,
    isStaticSite = false,
): boolean {
    if (
        (isLocalEnv && (!isSecret || isStaticSite)) ||
        (!isLocalEnv && isStaticSite)
    ) {
        if (status === 'only_local' || status === 'only local') {
            return false;
        }
    }

    return (
        status === 'drift' ||
        status === 'only_local' ||
        status === 'only local' ||
        status === 'only_cluster' ||
        status === 'only cluster'
    );
}

function renderStatusBadge(
    status?: string,
    isStagedEdit = false,
    isDeleted = false,
    row?: EnvTableRow,
    isLocalEnv = false,
    isStaticSite = false,
) {
    if (isDeleted) {
        return (
            <InfoTooltip trigger={<StatusPill tone="bad">Removing</StatusPill>}>
                Pending removal from disk when saved.
            </InfoTooltip>
        );
    }
    if (isStagedEdit) {
        return (
            <InfoTooltip trigger={<StatusPill tone="busy">Staged</StatusPill>}>
                Modified locally in this table.{' '}
                {!isLocalEnv && isStaticSite
                    ? 'Save & Push to CI to apply.'
                    : 'Save & Push or Save & Restart to apply.'}
            </InfoTooltip>
        );
    }
    if (!status) {
        return null;
    }
    if (status === 'in_sync' || status === 'in-sync') {
        return (
            <InfoTooltip trigger={<StatusPill tone="ok">In Sync</StatusPill>}>
                Local .env and the cluster ConfigMap/Secret hold the exact same
                value.
            </InfoTooltip>
        );
    }
    if (status === 'drift') {
        return (
            <InfoTooltip trigger={<StatusPill tone="warn">Drifted</StatusPill>}>
                Local .env and the cluster hold different values. Push or Pull
                to reconcile.
            </InfoTooltip>
        );
    }
    if (status === 'only_local' || status === 'only local') {
        if (isLocalEnv && (!row?.isSecret || isStaticSite)) {
            return (
                <InfoTooltip
                    trigger={<StatusPill tone="ok">Mounted (.env)</StatusPill>}
                >
                    Read live from your mounted .env file on disk in Local Dev —
                    no cluster ConfigMap or Secret push needed.
                </InfoTooltip>
            );
        }
        if (!isLocalEnv && isStaticSite) {
            return (
                <InfoTooltip
                    trigger={
                        <StatusPill tone="muted">Build-Time (.env)</StatusPill>
                    }
                >
                    Baked into static bundles at image build time and synced to
                    CI (
                    <code className="font-mono">&#123;ENV&#125;_BUILD_ENV</code>
                    ).
                </InfoTooltip>
            );
        }

        return (
            <InfoTooltip
                trigger={<StatusPill tone="warn">Local Only</StatusPill>}
            >
                Exists in your .env file on disk, but has not been pushed to the
                cluster yet.
            </InfoTooltip>
        );
    }
    if (status === 'only_cluster' || status === 'only cluster') {
        return (
            <InfoTooltip
                trigger={<StatusPill tone="bad">Cluster Only</StatusPill>}
            >
                Exists in the cluster ConfigMap/Secret, but is missing from your
                .env file on disk.
            </InfoTooltip>
        );
    }
    if (status === 'rotated' || status === 'rotated (excluded)') {
        return (
            <InfoTooltip
                trigger={<StatusPill tone="ok">Vault Managed</StatusPill>}
            >
                Managed and rotated automatically by OpenBao / Plex Commons.
            </InfoTooltip>
        );
    }
    if (status === 'secret (hidden)') {
        return (
            <InfoTooltip trigger={<StatusPill tone="muted">Hidden</StatusPill>}>
                Your cluster context does not have permission to read Secret
                values.
            </InfoTooltip>
        );
    }

    return <StatusPill tone="muted">{status}</StatusPill>;
}

const cellInputClass =
    'w-full bg-transparent px-2.5 py-2 font-mono text-xs text-ink placeholder:text-faint focus:bg-brand/5 focus:ring-2 focus:ring-brand focus:outline-hidden focus:ring-inset';

export default function EnvironmentVariablesTable({
    rows,
    stagedChanges,
    onStageEdit,
    onStageDelete,
    onUnstageKey,
    draftRows,
    onChangeDraftRows,
    reveal,
    loading = false,
    editable = true,
    canToggleSecret = false,
    showStatusColumn = false,
    isLocalEnv = false,
    isStaticSite = false,
    secretTargetLabel = 'app-secrets',
    configTargetLabel = 'app-config',
    emptyMessage = 'No environment variables found.',
}: {
    rows: EnvTableRow[];
    stagedChanges: Record<string, StagedEnvChange>;
    onStageEdit: (key: string, value: string, isSecret: boolean) => void;
    onStageDelete: (key: string, isSecret: boolean) => void;
    onUnstageKey: (key: string) => void;
    draftRows: DraftEnvRow[];
    onChangeDraftRows: (rows: DraftEnvRow[]) => void;
    reveal: boolean;
    loading?: boolean;
    editable?: boolean;
    canToggleSecret?: boolean;
    showStatusColumn?: boolean;
    isLocalEnv?: boolean;
    isStaticSite?: boolean;
    secretTargetLabel?: string;
    configTargetLabel?: string;
    emptyMessage?: string;
}) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<
        'all' | 'secrets' | 'config' | 'drift'
    >('all');
    const [focusedMaskedKey, setFocusedMaskedKey] = useState<string | null>(
        null,
    );
    const tableRef = useRef<HTMLTableElement>(null);

    const existingKeys = new Set(rows.map((r) => r.key));
    const sortedRows = [...rows].sort((a, b) => a.key.localeCompare(b.key));

    const filteredExisting = sortedRows.filter((row) => {
        const staged = stagedChanges[row.key];
        const effectiveSecret = staged ? staged.isSecret : row.isSecret;

        if (search.trim()) {
            const q = search.trim().toLowerCase();
            if (!row.key.toLowerCase().includes(q)) {
                return false;
            }
        }

        if (filter === 'secrets' && !effectiveSecret) {
            return false;
        }
        if (filter === 'config' && effectiveSecret) {
            return false;
        }
        if (
            filter === 'drift' &&
            !isDriftStatus(
                row.status,
                effectiveSecret,
                isLocalEnv,
                isStaticSite,
            ) &&
            !(row.key in stagedChanges)
        ) {
            return false;
        }

        return true;
    });

    const normalizedDraftRows = editable
        ? draftRows.length > 0
            ? draftRows
            : [FALLBACK_BLANK_ROW]
        : draftRows.filter((r) => r.key.trim() !== '' || r.value !== '');

    const filteredDrafts = normalizedDraftRows.filter((draft) => {
        const isBlank = draft.key.trim() === '' && draft.value === '';
        if (isBlank) {
            return editable;
        }
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            if (!draft.key.toLowerCase().includes(q)) {
                return false;
            }
        }
        if (filter === 'secrets' && !draft.isSecret) {
            return false;
        }
        if (filter === 'config' && draft.isSecret) {
            return false;
        }

        return true;
    });

    function focusCell(selector: string) {
        requestAnimationFrame(() => {
            const el =
                tableRef.current?.querySelector<HTMLInputElement>(selector);
            el?.focus();
        });
    }

    function appendDraftRow() {
        const base =
            draftRows.length > 0 ? draftRows : [{ ...FALLBACK_BLANK_ROW }];
        const nextRow = createDraftRow();
        const next = [...base, nextRow];
        onChangeDraftRows(next);
        focusCell(`input[data-draft-key="${nextRow.id}"]`);
    }

    function updateDraftRow(id: string, patch: Partial<DraftEnvRow>) {
        const base =
            draftRows.length > 0
                ? ensureTrailingBlank(draftRows)
                : [{ ...FALLBACK_BLANK_ROW }];
        const mapped = base.map((row) => {
            if (row.id !== id) {
                return row;
            }

            const updated = { ...row, ...patch };
            if (patch.key !== undefined && !updated.secretTouched) {
                updated.isSecret = inferIsSecretKey(updated.key);
            }

            return updated;
        });

        onChangeDraftRows(ensureTrailingBlank(mapped));
    }

    function removeDraftRow(id: string) {
        const remaining = draftRows.filter((r) => r.id !== id);
        onChangeDraftRows(ensureTrailingBlank(remaining));
    }

    function handleDraftEnter(draftId: string) {
        const currentList =
            draftRows.length > 0
                ? ensureTrailingBlank(draftRows)
                : [{ ...FALLBACK_BLANK_ROW }];
        const idx = currentList.findIndex((r) => r.id === draftId);
        if (idx === -1) {
            return;
        }

        const next = currentList[idx + 1];
        if (next) {
            focusCell(`input[data-draft-key="${next.id}"]`);
            return;
        }

        const created = createDraftRow();
        onChangeDraftRows([...currentList, created]);
        focusCell(`input[data-draft-key="${created.id}"]`);
    }

    function applyPastedDotenv(
        text: string,
        source: 'key' | 'value',
        targetDraft?: DraftEnvRow,
    ): boolean {
        if (source === 'value' && !/\r?\n/.test(text)) {
            return false;
        }

        const entries = parseDotenv(text);
        if (entries.length === 0) {
            return false;
        }

        const nextDrafts =
            draftRows.length > 0
                ? [...ensureTrailingBlank(draftRows)]
                : [{ ...FALLBACK_BLANK_ROW }];
        let targetIndex = targetDraft
            ? nextDrafts.findIndex((r) => r.id === targetDraft.id)
            : nextDrafts.length - 1;
        if (targetIndex < 0) {
            targetIndex = nextDrafts.length - 1;
        }

        const preserveTargetSecret = Boolean(targetDraft?.secretTouched);
        const fallbackSecret = Boolean(targetDraft?.isSecret);

        let insertedIntoDrafts = 0;

        for (const entry of entries) {
            const existingRow = rows.find((r) => r.key === entry.key);
            if (existingRow) {
                onStageEdit(
                    entry.key,
                    entry.value,
                    canToggleSecret
                        ? (stagedChanges[entry.key]?.isSecret ??
                              existingRow.isSecret)
                        : existingRow.isSecret,
                );
                continue;
            }

            const desiredSecret = preserveTargetSecret
                ? fallbackSecret
                : entry.isSecret;

            const existingDraftIndex = nextDrafts.findIndex(
                (d) => normalizeEnvKey(d.key) === entry.key,
            );
            if (existingDraftIndex >= 0) {
                nextDrafts[existingDraftIndex] = {
                    ...nextDrafts[existingDraftIndex],
                    key: entry.key,
                    value: entry.value,
                    isSecret: desiredSecret,
                };
                continue;
            }

            const slot = nextDrafts[targetIndex + insertedIntoDrafts];
            if (slot && slot.key.trim() === '' && slot.value === '') {
                nextDrafts[targetIndex + insertedIntoDrafts] = {
                    ...slot,
                    key: entry.key,
                    value: entry.value,
                    isSecret: desiredSecret,
                };
            } else {
                nextDrafts.splice(
                    targetIndex + insertedIntoDrafts,
                    0,
                    createDraftRow({
                        key: entry.key,
                        value: entry.value,
                        isSecret: desiredSecret,
                    }),
                );
            }
            insertedIntoDrafts += 1;
        }

        onChangeDraftRows(ensureTrailingBlank(nextDrafts));

        return true;
    }

    const totalCols = showStatusColumn ? 6 : 5;

    return (
        <div className="flex flex-col gap-3">
            {/* Search, Filter & Add Row Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-soft" />
                        <input
                            type="text"
                            placeholder="Search variables…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-8 rounded-lg border border-line bg-surface pr-3 pl-8 text-xs text-ink placeholder:text-soft focus:border-brand focus:outline-hidden"
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setFilter('all')}
                            className={cn(
                                'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                filter === 'all'
                                    ? 'bg-paper font-semibold text-ink'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter('secrets')}
                            className={cn(
                                'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                filter === 'secrets'
                                    ? 'bg-paper font-semibold text-ink'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            Secrets
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter('config')}
                            className={cn(
                                'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                filter === 'config'
                                    ? 'bg-paper font-semibold text-ink'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            Config
                        </button>
                        {showStatusColumn && (
                            <button
                                type="button"
                                onClick={() => setFilter('drift')}
                                className={cn(
                                    'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    filter === 'drift'
                                        ? 'bg-paper font-semibold text-ink'
                                        : 'text-soft hover:text-ink',
                                )}
                            >
                                Drifted
                            </button>
                        )}
                    </div>
                </div>

                {editable && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={appendDraftRow}
                        title="Append a blank row to enter another variable"
                    >
                        <Plus className="size-3.5" />
                        <span>Add Row</span>
                    </Button>
                )}
            </div>

            {/* Excel-style Grid */}
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table
                    ref={tableRef}
                    className="w-full border-collapse text-left text-xs"
                >
                    <thead>
                        <tr className="divide-x divide-line border-b border-line bg-paper/70 text-[11px] font-semibold tracking-wider text-soft uppercase">
                            <th className="w-10 px-2 py-2 text-center">#</th>
                            <th className="w-[28%] min-w-[200px] px-3 py-2">
                                Variable
                            </th>
                            <th className="w-36 px-3 py-2">Target</th>
                            <th className="min-w-[240px] px-3 py-2">Value</th>
                            {showStatusColumn && (
                                <th className="w-32 px-3 py-2">Status</th>
                            )}
                            <th className="w-16 px-2 py-2 text-right">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                        {loading && rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={totalCols}
                                    className="px-4 py-8 text-center text-soft"
                                >
                                    Loading environment variables…
                                </td>
                            </tr>
                        ) : (
                            <>
                                {filteredExisting.length === 0 &&
                                    filteredDrafts.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={totalCols}
                                                className="px-4 py-8 text-center text-soft"
                                            >
                                                {search
                                                    ? 'No variables match your search.'
                                                    : emptyMessage}
                                            </td>
                                        </tr>
                                    )}

                                {filteredExisting.map((row, idx) => {
                                    const staged = stagedChanges[row.key];
                                    const isStaged = row.key in stagedChanges;
                                    const isDeleted = staged?.value === null;
                                    const effectiveSecret = staged
                                        ? staged.isSecret
                                        : row.isSecret;
                                    const isMaskedUnrevealed =
                                        row.isSecret &&
                                        !reveal &&
                                        !isStaged &&
                                        row.value !== null;
                                    const isEditingMasked =
                                        focusedMaskedKey === row.key;
                                    const displayInputValue = isStaged
                                        ? (staged.value ?? '')
                                        : isMaskedUnrevealed
                                          ? ''
                                          : (row.value ?? '');

                                    const canToggleThisRow =
                                        editable &&
                                        canToggleSecret &&
                                        !isDeleted &&
                                        (reveal || !row.isSecret || isStaged);

                                    return (
                                        <tr
                                            key={row.key}
                                            className={cn(
                                                'divide-x divide-line transition-colors hover:bg-paper/30',
                                                isStaged &&
                                                    !isDeleted &&
                                                    'bg-brand/5',
                                                isDeleted &&
                                                    'bg-accent-tint/30 opacity-60',
                                            )}
                                        >
                                            <td className="bg-paper/40 px-2 py-2 text-center font-mono text-[11px] text-faint select-none">
                                                {idx + 1}
                                            </td>

                                            <td className="px-3 py-2 font-mono">
                                                <div className="flex items-center gap-2">
                                                    {effectiveSecret ? (
                                                        <span title="Secret">
                                                            <Lock className="size-3 shrink-0 text-amber-500" />
                                                        </span>
                                                    ) : (
                                                        <span title="Config">
                                                            <Globe className="size-3 shrink-0 text-blue-500" />
                                                        </span>
                                                    )}
                                                    <span
                                                        className={cn(
                                                            'font-semibold text-ink',
                                                            isDeleted &&
                                                                'line-through',
                                                        )}
                                                    >
                                                        {row.key}
                                                    </span>
                                                    {(row.status ===
                                                        'rotated' ||
                                                        row.status ===
                                                            'rotated (excluded)') && (
                                                        <span
                                                            className="rounded-full bg-ok-tint px-1.5 py-0.5 text-[10px] font-medium text-ok"
                                                            title="Generated or rotated by OpenBao Vault"
                                                        >
                                                            Vault
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="p-0">
                                                {canToggleThisRow ? (
                                                    <InfoTooltip
                                                        interactive
                                                        className="w-full"
                                                        trigger={
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const nextSecret =
                                                                        !effectiveSecret;
                                                                    const nextVal =
                                                                        staged?.value ??
                                                                        row.value ??
                                                                        '';
                                                                    if (
                                                                        nextSecret ===
                                                                            row.isSecret &&
                                                                        nextVal ===
                                                                            (row.value ??
                                                                                '')
                                                                    ) {
                                                                        onUnstageKey(
                                                                            row.key,
                                                                        );
                                                                    } else {
                                                                        onStageEdit(
                                                                            row.key,
                                                                            nextVal,
                                                                            nextSecret,
                                                                        );
                                                                    }
                                                                }}
                                                                className="flex h-full w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left font-mono text-[11px] text-ink transition hover:bg-brand/5"
                                                            >
                                                                {effectiveSecret ? (
                                                                    <>
                                                                        <Lock className="size-3 text-amber-500" />
                                                                        <span>
                                                                            {
                                                                                secretTargetLabel
                                                                            }
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Globe className="size-3 text-blue-500" />
                                                                        <span>
                                                                            {
                                                                                configTargetLabel
                                                                            }
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        }
                                                    >
                                                        Click to switch between{' '}
                                                        {secretTargetLabel}{' '}
                                                        (Secret) and{' '}
                                                        {configTargetLabel}{' '}
                                                        (ConfigMap).
                                                    </InfoTooltip>
                                                ) : (isLocalEnv &&
                                                      (!effectiveSecret ||
                                                          isStaticSite) &&
                                                      (row.status ===
                                                          'only_local' ||
                                                          row.status ===
                                                              'only local')) ||
                                                  (isLocalEnv &&
                                                      isStaticSite) ? (
                                                    <InfoTooltip
                                                        className="w-full"
                                                        trigger={
                                                            <div className="w-full px-3 py-2 font-mono text-[11px] text-soft">
                                                                .env (mounted)
                                                            </div>
                                                        }
                                                    >
                                                        Local Dev mounts your
                                                        project folder directly
                                                        into the container, so
                                                        variables are read live
                                                        from .env.
                                                    </InfoTooltip>
                                                ) : (
                                                    <InfoTooltip
                                                        className="w-full"
                                                        trigger={
                                                            <div className="w-full px-3 py-2 font-mono text-[11px] text-soft">
                                                                {!isLocalEnv &&
                                                                isStaticSite
                                                                    ? 'Build-Time (.env)'
                                                                    : effectiveSecret
                                                                      ? secretTargetLabel
                                                                      : configTargetLabel}
                                                            </div>
                                                        }
                                                    >
                                                        {!isLocalEnv &&
                                                        isStaticSite
                                                            ? 'Static site variables are injected at image build time and synced to CI ({ENV}_BUILD_ENV).'
                                                            : effectiveSecret
                                                              ? `Stored in .env and pushed to the ${secretTargetLabel} Kubernetes Secret (and OpenBao when enabled).`
                                                              : `Stored in the ${configTargetLabel} Kubernetes ConfigMap.`}
                                                    </InfoTooltip>
                                                )}
                                            </td>

                                            <td className="p-0">
                                                {editable && !isDeleted ? (
                                                    isMaskedUnrevealed &&
                                                    !isEditingMasked ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFocusedMaskedKey(
                                                                    row.key,
                                                                );
                                                                focusCell(
                                                                    `input[data-row-value="${row.key}"]`,
                                                                );
                                                            }}
                                                            title="Click to enter a new secret value, or click Reveal above to inspect"
                                                            className="w-full cursor-text px-2.5 py-2 text-left font-mono text-xs text-soft transition hover:bg-brand/5 hover:text-ink"
                                                        >
                                                            ••••••••••••
                                                        </button>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            data-row-value={
                                                                row.key
                                                            }
                                                            value={
                                                                displayInputValue
                                                            }
                                                            placeholder={
                                                                isMaskedUnrevealed
                                                                    ? 'Type new secret value…'
                                                                    : row.value ===
                                                                        null
                                                                      ? '(not on disk — type value)'
                                                                      : '(empty)'
                                                            }
                                                            spellCheck={false}
                                                            onChange={(e) => {
                                                                const nextVal =
                                                                    e.target
                                                                        .value;
                                                                if (
                                                                    !isMaskedUnrevealed &&
                                                                    nextVal ===
                                                                        (row.value ??
                                                                            '') &&
                                                                    effectiveSecret ===
                                                                        row.isSecret
                                                                ) {
                                                                    onUnstageKey(
                                                                        row.key,
                                                                    );
                                                                } else {
                                                                    onStageEdit(
                                                                        row.key,
                                                                        nextVal,
                                                                        effectiveSecret,
                                                                    );
                                                                }
                                                            }}
                                                            onBlur={() => {
                                                                if (
                                                                    isEditingMasked
                                                                ) {
                                                                    setFocusedMaskedKey(
                                                                        null,
                                                                    );
                                                                }
                                                            }}
                                                            onPaste={(e) => {
                                                                const text =
                                                                    e.clipboardData.getData(
                                                                        'text',
                                                                    );
                                                                if (
                                                                    applyPastedDotenv(
                                                                        text,
                                                                        'value',
                                                                    )
                                                                ) {
                                                                    e.preventDefault();
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (
                                                                    e.key ===
                                                                    'Enter'
                                                                ) {
                                                                    e.preventDefault();
                                                                    const nextRow =
                                                                        filteredExisting[
                                                                            idx +
                                                                                1
                                                                        ];
                                                                    if (
                                                                        nextRow
                                                                    ) {
                                                                        focusCell(
                                                                            `input[data-row-value="${nextRow.key}"]`,
                                                                        );
                                                                    } else if (
                                                                        filteredDrafts[0]
                                                                    ) {
                                                                        focusCell(
                                                                            `input[data-draft-key="${filteredDrafts[0].id}"]`,
                                                                        );
                                                                    }
                                                                }
                                                            }}
                                                            className={
                                                                cellInputClass
                                                            }
                                                        />
                                                    )
                                                ) : (
                                                    <div className="px-2.5 py-2 font-mono text-xs break-all text-ink">
                                                        {isDeleted ? (
                                                            <span className="text-soft italic">
                                                                (pending
                                                                removal)
                                                            </span>
                                                        ) : row.value ===
                                                          null ? (
                                                            <span className="text-soft italic">
                                                                (not on disk)
                                                            </span>
                                                        ) : row.isSecret &&
                                                          !reveal ? (
                                                            '••••••••••••'
                                                        ) : row.value === '' ? (
                                                            <span className="text-soft italic">
                                                                (empty)
                                                            </span>
                                                        ) : (
                                                            row.value
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {showStatusColumn && (
                                                <td className="px-3 py-2">
                                                    {renderStatusBadge(
                                                        row.status,
                                                        isStaged && !isDeleted,
                                                        isDeleted,
                                                        row,
                                                        isLocalEnv,
                                                        isStaticSite,
                                                    )}
                                                </td>
                                            )}

                                            <td className="px-2 py-1.5 text-right">
                                                {editable && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        {isStaged && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    onUnstageKey(
                                                                        row.key,
                                                                    )
                                                                }
                                                                className="cursor-pointer rounded p-1 text-brand transition-colors hover:bg-paper"
                                                                title={
                                                                    isDeleted
                                                                        ? `Restore ${row.key}`
                                                                        : `Revert changes to ${row.key}`
                                                                }
                                                            >
                                                                <RotateCw className="size-3.5" />
                                                            </button>
                                                        )}
                                                        {!isDeleted && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    onStageDelete(
                                                                        row.key,
                                                                        row.isSecret,
                                                                    )
                                                                }
                                                                className="cursor-pointer rounded p-1 text-soft transition-colors hover:bg-paper hover:text-accent"
                                                                title={`Delete ${row.key}`}
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}

                                {/* Multi-row Excel Draft Rows */}
                                {filteredDrafts.map((draft, dIdx) => {
                                    const rowNumber =
                                        filteredExisting.length + dIdx + 1;
                                    const normalizedKey = normalizeEnvKey(
                                        draft.key,
                                    );
                                    const isDuplicateExisting =
                                        normalizedKey !== '' &&
                                        existingKeys.has(normalizedKey);
                                    const isBlank =
                                        draft.key.trim() === '' &&
                                        draft.value === '';
                                    const isOnlyBlank =
                                        isBlank &&
                                        normalizedDraftRows.length === 1;

                                    return (
                                        <tr
                                            key={draft.id}
                                            className={cn(
                                                'divide-x divide-line transition-colors',
                                                isBlank
                                                    ? 'bg-paper/20 hover:bg-paper/40'
                                                    : 'bg-brand/5',
                                            )}
                                        >
                                            <td className="bg-paper/40 px-2 py-2 text-center font-mono text-[11px] text-faint select-none">
                                                {rowNumber}
                                            </td>

                                            <td className="p-0">
                                                <div className="flex items-center pl-3">
                                                    {draft.isSecret ? (
                                                        <span title="Secret (sensitive)">
                                                            <Lock className="size-3 shrink-0 text-amber-500" />
                                                        </span>
                                                    ) : (
                                                        <span title="Non-secret configuration">
                                                            <Globe className="size-3 shrink-0 text-blue-500" />
                                                        </span>
                                                    )}
                                                    <input
                                                        type="text"
                                                        data-draft-key={
                                                            draft.id
                                                        }
                                                        value={draft.key}
                                                        placeholder="NEW_KEY (or paste .env)"
                                                        spellCheck={false}
                                                        onChange={(e) =>
                                                            updateDraftRow(
                                                                draft.id,
                                                                {
                                                                    key: e.target.value
                                                                        .toUpperCase()
                                                                        .replace(
                                                                            /\s+/g,
                                                                            '_',
                                                                        ),
                                                                },
                                                            )
                                                        }
                                                        onPaste={(e) => {
                                                            const text =
                                                                e.clipboardData.getData(
                                                                    'text',
                                                                );
                                                            if (
                                                                applyPastedDotenv(
                                                                    text,
                                                                    'key',
                                                                    draft,
                                                                )
                                                            ) {
                                                                e.preventDefault();
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                'Enter'
                                                            ) {
                                                                e.preventDefault();
                                                                handleDraftEnter(
                                                                    draft.id,
                                                                );
                                                            }
                                                        }}
                                                        className={cn(
                                                            cellInputClass,
                                                            'font-semibold',
                                                        )}
                                                    />
                                                    {isDuplicateExisting && (
                                                        <span
                                                            className="mr-2 shrink-0 rounded bg-warn-tint px-1.5 py-0.5 text-[10px] font-medium text-warn"
                                                            title="Key already exists above — saving will overwrite its value"
                                                        >
                                                            Overwrite
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="p-0">
                                                {canToggleSecret ? (
                                                    <InfoTooltip
                                                        interactive
                                                        className="w-full"
                                                        trigger={
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    updateDraftRow(
                                                                        draft.id,
                                                                        {
                                                                            isSecret:
                                                                                !draft.isSecret,
                                                                            secretTouched: true,
                                                                        },
                                                                    )
                                                                }
                                                                className="flex h-full w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left font-mono text-[11px] text-soft transition hover:bg-brand/5 hover:text-ink"
                                                            >
                                                                {draft.isSecret ? (
                                                                    <>
                                                                        <Lock className="size-3 shrink-0 text-amber-500" />
                                                                        <span>
                                                                            {
                                                                                secretTargetLabel
                                                                            }
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Globe className="size-3 shrink-0 text-blue-500" />
                                                                        <span>
                                                                            {
                                                                                configTargetLabel
                                                                            }
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        }
                                                    >
                                                        Click to choose whether
                                                        this variable is stored
                                                        in {secretTargetLabel}{' '}
                                                        (Secret) or{' '}
                                                        {configTargetLabel}{' '}
                                                        (ConfigMap).
                                                    </InfoTooltip>
                                                ) : (
                                                    <InfoTooltip
                                                        className="w-full"
                                                        trigger={
                                                            <div className="flex h-full w-full items-center px-3 py-2 font-mono text-[11px] whitespace-nowrap text-soft">
                                                                {draft.isSecret &&
                                                                !isStaticSite
                                                                    ? secretTargetLabel
                                                                    : isLocalEnv
                                                                      ? '.env (mounted)'
                                                                      : isStaticSite
                                                                        ? 'Build-Time (.env)'
                                                                        : configTargetLabel}
                                                            </div>
                                                        }
                                                    >
                                                        {isStaticSite
                                                            ? isLocalEnv
                                                                ? 'Static Local Dev pods mount your .env file directly from disk.'
                                                                : 'Static site variables are saved to .env, baked at image build time, and synced to CI ({ENV}_BUILD_ENV).'
                                                            : draft.isSecret
                                                              ? `Inferred from key name (*KEY*, *SECRET*, *PASSWORD*, *TOKEN*). Saved to .env and pushed to ${secretTargetLabel}.`
                                                              : isLocalEnv
                                                                ? 'Non-secret variables in Local Dev are saved to .env on disk and read via the container mount (not pushed to a ConfigMap).'
                                                                : `Non-secret variable saved to .env and applied to ${configTargetLabel} during deploy.`}
                                                    </InfoTooltip>
                                                )}
                                            </td>

                                            <td className="p-0">
                                                <input
                                                    type="text"
                                                    data-draft-value={draft.id}
                                                    value={draft.value}
                                                    placeholder="Value"
                                                    spellCheck={false}
                                                    onChange={(e) =>
                                                        updateDraftRow(
                                                            draft.id,
                                                            {
                                                                value: e.target
                                                                    .value,
                                                            },
                                                        )
                                                    }
                                                    onPaste={(e) => {
                                                        const text =
                                                            e.clipboardData.getData(
                                                                'text',
                                                            );
                                                        if (
                                                            applyPastedDotenv(
                                                                text,
                                                                'value',
                                                                draft,
                                                            )
                                                        ) {
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleDraftEnter(
                                                                draft.id,
                                                            );
                                                        }
                                                    }}
                                                    className={cellInputClass}
                                                />
                                            </td>

                                            {showStatusColumn && (
                                                <td className="px-3 py-2">
                                                    {!isBlank && (
                                                        <StatusPill tone="busy">
                                                            New
                                                        </StatusPill>
                                                    )}
                                                </td>
                                            )}

                                            <td className="px-2 py-1.5 text-right">
                                                {!isOnlyBlank && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeDraftRow(
                                                                draft.id,
                                                            )
                                                        }
                                                        className="cursor-pointer rounded p-1 text-soft transition-colors hover:bg-paper hover:text-accent"
                                                        title="Remove row"
                                                    >
                                                        <X className="size-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            {editable && (
                <p className="text-[11px] text-soft">
                    Click any value cell to edit inline, type into the bottom
                    row or click <span className="font-medium">Add Row</span>{' '}
                    for multiple entries, press{' '}
                    <kbd className="rounded border border-line bg-paper px-1 font-mono text-[10px]">
                        Enter
                    </kbd>{' '}
                    to jump to the next row, or paste{' '}
                    <code className="font-mono text-ink">KEY=value</code> lines
                    to import in bulk.
                </p>
            )}
        </div>
    );
}
