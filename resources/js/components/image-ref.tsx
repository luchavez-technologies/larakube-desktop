import { ArrowRight, ExternalLink } from 'lucide-react';
import CopyButton from '@/components/copy-button';
import { ExternalLinkButton } from '@/lib/open-external';
import { cn } from '@/lib/utils';
import type { ImageContainer } from '@/types/larakube';

/** `docker.io/library/postgres:17` → registry `docker.io`, path `library/postgres`, tag `17`. */
function parse(reference: string): {
    registry: string;
    path: string;
    tag: string | null;
} {
    const withoutDigest = reference.split('@')[0];
    const slash = withoutDigest.lastIndexOf('/');
    const colon = withoutDigest.lastIndexOf(':');
    const hasTag = colon > slash;
    const name = hasTag ? withoutDigest.slice(0, colon) : withoutDigest;
    const tag = hasTag ? withoutDigest.slice(colon + 1) : null;
    const first = name.split('/')[0];
    const explicitRegistry =
        name.includes('/') &&
        (first.includes('.') || first.includes(':') || first === 'localhost');

    return explicitRegistry
        ? { registry: first, path: name.slice(first.length + 1), tag }
        : { registry: 'docker.io', path: name, tag };
}

/** The image's public page, or null for a registry without one we know. */
export function registryUrl(reference: string): string | null {
    const { registry, path } = parse(reference);

    if (
        registry === 'docker.io' ||
        registry === 'index.docker.io' ||
        registry === 'registry-1.docker.io'
    ) {
        const repo = path.replace(/^library\//, '');

        return repo.includes('/')
            ? `https://hub.docker.com/r/${repo}/tags`
            : `https://hub.docker.com/_/${repo}/tags`;
    }

    if (registry === 'ghcr.io') {
        return `https://ghcr.io/${path}`;
    }

    if (registry === 'quay.io') {
        return `https://quay.io/repository/${path}?tab=tags`;
    }

    return null;
}

/** Drops the implicit `docker.io/` and `library/` so a reference reads the way people search for it. */
function display(reference: string): string {
    return reference
        .replace(/^(docker\.io|index\.docker\.io|registry-1\.docker\.io)\//, '')
        .replace(/^library\//, '');
}

function tagOf(reference: string): string | null {
    return parse(reference).tag;
}

/**
 * A copyable image reference, with a link to its registry page and, when this
 * build would install a different tag, what an update brings.
 */
export default function ImageRef({
    container,
    className,
}: {
    container: Pick<ImageContainer, 'running' | 'available'>;
    className?: string;
}) {
    const { running, available } = container;
    const link = registryUrl(running);
    const tag = tagOf(running);
    const unpinned = tag === null || tag === 'latest';
    const nextTag =
        available !== null && available !== running ? tagOf(available) : null;

    return (
        <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
            <span
                className="truncate font-mono text-[11px] text-soft select-all"
                title={running}
            >
                {display(running)}
            </span>
            {nextTag && (
                <span
                    className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] font-medium text-brand"
                    title={`This build installs ${available}`}
                >
                    <ArrowRight className="size-3" />
                    {nextTag}
                </span>
            )}
            {unpinned && (
                <span
                    className="shrink-0 rounded bg-warn-tint px-1.5 py-0.5 text-[10px] font-medium text-warn"
                    title="Not pinned to a version, so the exact version running can't be verified from its tag."
                >
                    unpinned
                </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <CopyButton
                    value={running}
                    label=""
                    copiedLabel=""
                    title={`Copy ${running}`}
                    className="h-6 px-1.5"
                />
                {link && (
                    <ExternalLinkButton
                        url={link}
                        className="inline-flex h-6 cursor-pointer items-center rounded-md px-1.5 text-soft hover:bg-badge hover:text-ink"
                        title="Open its registry page to see every published version"
                    >
                        <ExternalLink className="size-3.5" />
                    </ExternalLinkButton>
                )}
            </span>
        </div>
    );
}
