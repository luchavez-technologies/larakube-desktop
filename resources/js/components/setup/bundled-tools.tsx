import { ListRow, TwoLine } from '@/components/list-row';

/** Display names for the keys /etc/larakube-rootfs.json records. */
const LABELS: Record<string, string> = {
    larakube: 'LaraKube CLI',
    k3s: 'k3s',
    kubectl: 'kubectl',
    gh: 'GitHub CLI',
    tea: 'Tea CLI',
    git: 'Git',
    podman: 'Podman',
    base: 'Ubuntu',
};

/**
 * What the larakube-ubuntu image itself carries, read-only: the image (not
 * Setup) installs and updates these, so there is nothing to click. Projects
 * live in the distro, so their tools (gh, tea, git, Podman) live there too.
 */
export default function BundledTools({
    tools,
}: {
    tools: Record<string, string> | null | undefined;
}) {
    if (!tools || Object.keys(tools).length === 0) {
        return null;
    }

    const entries = Object.entries(tools).sort(
        ([a], [b]) =>
            Object.keys(LABELS).indexOf(a) - Object.keys(LABELS).indexOf(b),
    );

    return (
        <div className="mt-4">
            <p className="mb-1 text-xs font-medium tracking-wide text-soft uppercase">
                Included in LaraKube Linux
            </p>
            {entries.map(([name, version]) => (
                <ListRow key={name}>
                    <TwoLine
                        title={LABELS[name] ?? name}
                        detail={version}
                        mono
                    />
                </ListRow>
            ))}
        </div>
    );
}

export function BundledToolsSkeleton() {
    return (
        <div className="mt-4 space-y-2" aria-hidden>
            <div className="h-3 w-40 animate-pulse rounded bg-paper" />
            <div className="h-8 animate-pulse rounded bg-paper" />
            <div className="h-8 animate-pulse rounded bg-paper" />
        </div>
    );
}
