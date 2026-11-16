import {
    SiCodeberg,
    SiDocker,
    SiForgejo,
    SiGithub,
    SiKubernetes,
    SiRedhat,
} from '@icons-pack/react-simple-icons';
import { ArrowRight, Package } from 'lucide-react';
import type { ComponentType } from 'react';
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

type RegistrySource = {
    /** Who hosts the image, for the tooltip. */
    name: string;
    icon: ComponentType<{ className?: string }>;
    /** The image's public page (its versions), or null where no reliable one exists. */
    url: string | null;
};

const DOCKER_HUB_HOSTS = [
    'docker.io',
    'index.docker.io',
    'registry-1.docker.io',
];

/** Forgejo-based registries share Forgejo's package page layout. */
const FORGEJO_HOSTS: Record<
    string,
    { name: string; icon: RegistrySource['icon'] }
> = {
    'code.forgejo.org': { name: 'Forgejo', icon: SiForgejo },
    'codeberg.org': { name: 'Codeberg', icon: SiCodeberg },
};

/** Where an image comes from, and the page that lists its versions when there is one. */
export function registrySource(reference: string): RegistrySource {
    const { registry, path } = parse(reference);

    if (DOCKER_HUB_HOSTS.includes(registry)) {
        const repo = path.replace(/^library\//, '');

        return {
            name: 'Docker Hub',
            icon: SiDocker,
            url: repo.includes('/')
                ? `https://hub.docker.com/r/${repo}/tags`
                : `https://hub.docker.com/_/${repo}/tags`,
        };
    }

    if (registry === 'ghcr.io') {
        return {
            name: 'GitHub Container Registry',
            icon: SiGithub,
            url: `https://ghcr.io/${path}`,
        };
    }

    if (registry === 'quay.io') {
        return {
            name: 'Quay.io',
            icon: SiRedhat,
            url: `https://quay.io/repository/${path}?tab=tags`,
        };
    }

    const forgejo = FORGEJO_HOSTS[registry];

    if (forgejo && path.includes('/')) {
        const owner = path.slice(0, path.indexOf('/'));
        const name = path.slice(owner.length + 1);

        return {
            ...forgejo,
            url: `https://${registry}/${owner}/-/packages/container/${name}`,
        };
    }

    if (registry === 'registry.k8s.io') {
        return {
            name: 'the Kubernetes registry',
            icon: SiKubernetes,
            url: null,
        };
    }

    return { name: registry, icon: Package, url: null };
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
 * A copyable image reference. Its registry's icon opens the image's page where
 * one exists; an arrow shows the tag an update would install.
 */
export default function ImageRef({
    container,
    className,
}: {
    container: Pick<ImageContainer, 'running' | 'available'>;
    className?: string;
}) {
    const { running, available } = container;
    const source = registrySource(running);
    const SourceIcon = source.icon;
    const tag = tagOf(running);
    const unpinned = tag === null || tag === 'latest';
    const nextTag =
        available !== null && available !== running ? tagOf(available) : null;

    return (
        <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
            {source.url ? (
                <ExternalLinkButton
                    url={source.url}
                    className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-soft hover:bg-badge hover:text-ink"
                    title={`Open on ${source.name} to see every published version`}
                    aria-label={`Open on ${source.name}`}
                >
                    <SourceIcon className="size-3.5" />
                </ExternalLinkButton>
            ) : (
                <span
                    className="inline-flex size-5 shrink-0 items-center justify-center text-faint"
                    title={`From ${source.name}`}
                >
                    <SourceIcon className="size-3.5" />
                </span>
            )}
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
            </span>
        </div>
    );
}
