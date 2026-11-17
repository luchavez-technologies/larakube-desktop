import { useState } from 'react';
import { Monitor, SquareTerminal } from 'lucide-react';
import { ListRow, TwoLine } from '@/components/list-row';
import ProviderLogo from '@/components/provider-logo';
import StickyTabs from '@/components/sticky-tabs';
import WakeUpButton from '@/components/wake-up-button';
import ToolCatalogList, {
    AlsoOnBadge,
    type CatalogEntry,
} from '@/components/setup/tool-catalog';
import { useToolStatus } from '@/lib/tool-status';

export type BundledState = {
    tools: Record<string, string> | null;
    asleep: boolean;
};

/** Display names for the keys /etc/larakube-rootfs.json records. */
const LABELS: Record<string, string> = {
    k3s: 'k3s',
    kubectl: 'kubectl',
    aws: 'AWS CLI',
    gcloud: 'Google Cloud CLI',
    gh: 'GitHub CLI',
    tea: 'Tea CLI',
    git: 'Git',
    podman: 'Podman',
};

/**
 * Manifest keys the tab leaves out: the CLI has its own actionable row (the
 * `larakube-wsl` catalog entry), and the base image is not named in the UI
 * (ADR 0022).
 */
const HIDDEN = ['larakube', 'base'];

type Side = 'windows' | 'wsl';

/**
 * Setup's command-line tools on Windows with local development: one tab per
 * side. Windows tools install and update from here; LaraKube Linux's come
 * with its image, so they are read-only rows next to the CLI inside it. A
 * tool both sides have is badged on each, so the overlap reads at a glance.
 */
export default function ToolSides({
    catalog,
    bundled,
    channel,
    refresh,
    highlight,
}: {
    catalog: CatalogEntry[];
    bundled: BundledState | null | undefined;
    channel: string;
    refresh: number;
    highlight?: string | null;
}) {
    const windowsEntries = catalog.filter(
        (entry) => entry.environment !== 'wsl',
    );
    const wslEntries = catalog.filter((entry) => entry.environment === 'wsl');
    const [side, setSide] = useState<Side>(
        wslEntries.some((entry) => entry.slug === highlight)
            ? 'wsl'
            : 'windows',
    );

    const bundledTools = Object.entries(bundled?.tools ?? {})
        .filter(([name]) => !HIDDEN.includes(name))
        .sort(
            ([a], [b]) =>
                Object.keys(LABELS).indexOf(a) - Object.keys(LABELS).indexOf(b),
        );
    const bundledNames = new Set(Object.keys(bundled?.tools ?? {}));
    const windowsSlugs = new Set(windowsEntries.map((entry) => entry.slug));

    // The image's manifest names the CLI too, so it is badged like any other shared tool.
    const alsoInLinux: Record<string, string> = Object.fromEntries(
        windowsEntries
            .filter((entry) => bundledNames.has(entry.slug))
            .map((entry) => [entry.slug, 'Also in LaraKube Linux']),
    );

    return (
        <>
            <StickyTabs<Side>
                className="static mx-0 mb-2 bg-transparent px-0"
                activeTab={side}
                onChange={setSide}
                tabs={[
                    {
                        id: 'windows',
                        label: 'This computer',
                        icon: Monitor,
                        badge: windowsEntries.length,
                    },
                    {
                        id: 'wsl',
                        label: 'LaraKube Linux',
                        icon: SquareTerminal,
                        badge:
                            wslEntries.length + bundledTools.length ||
                            undefined,
                    },
                ]}
            />
            {side === 'windows' ? (
                <ToolCatalogList
                    catalog={windowsEntries}
                    channel={channel}
                    refresh={refresh}
                    highlight={highlight}
                    hideEnvironment
                    alsoOn={alsoInLinux}
                />
            ) : (
                <>
                    <ToolCatalogList
                        catalog={wslEntries}
                        channel={channel}
                        refresh={refresh}
                        highlight={highlight}
                        hideEnvironment
                        alsoOn={{ 'larakube-wsl': 'Also on Windows' }}
                    />
                    {bundled === undefined ? (
                        <BundledToolsSkeleton />
                    ) : bundled?.asleep ? (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2.5 ring-1 ring-line ring-inset">
                            <p className="text-xs text-soft">
                                LaraKube Linux is asleep. Wake it to see the
                                tools that come with it.
                            </p>
                            <WakeUpButton />
                        </div>
                    ) : bundledTools.length > 0 ? (
                        <div className="mt-4">
                            <p className="mb-1 text-xs font-medium tracking-wide text-soft uppercase">
                                Included in LaraKube Linux
                            </p>
                            <p className="mb-1 text-xs text-soft">
                                Updating LaraKube Linux updates these.
                            </p>
                            {bundledTools.map(([name, version]) => (
                                <BundledRow
                                    key={name}
                                    name={name}
                                    version={version}
                                    onWindows={windowsSlugs.has(name)}
                                    refresh={refresh}
                                />
                            ))}
                        </div>
                    ) : null}
                </>
            )}
        </>
    );
}

function BundledRow({
    name,
    version,
    onWindows,
    refresh,
}: {
    name: string;
    version: string;
    onWindows: boolean;
    refresh: number;
}) {
    return (
        <ListRow>
            <div className="flex min-w-0 items-center gap-3">
                <ProviderLogo slug={name} size="sm" />
                <TwoLine
                    title={
                        <span className="flex flex-wrap items-center gap-2">
                            <span>{LABELS[name] ?? name}</span>
                            {onWindows && (
                                <AlsoOnWindows slug={name} refresh={refresh} />
                            )}
                        </span>
                    }
                    detail={version}
                    mono
                />
            </div>
        </ListRow>
    );
}

/** Badged only when the Windows copy is actually installed, not merely installable. */
function AlsoOnWindows({ slug, refresh }: { slug: string; refresh: number }) {
    const { status } = useToolStatus(slug, refresh);

    return status?.installed ? <AlsoOnBadge label="Also on Windows" /> : null;
}

function BundledToolsSkeleton() {
    return (
        <div className="mt-4 space-y-2" aria-hidden>
            <div className="h-3 w-40 animate-pulse rounded bg-paper" />
            <div className="h-8 animate-pulse rounded bg-paper" />
            <div className="h-8 animate-pulse rounded bg-paper" />
        </div>
    );
}
