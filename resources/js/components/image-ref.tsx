import {
    SiCodeberg,
    SiDocker,
    SiForgejo,
    SiGithub,
    SiKubernetes,
    SiRedhat,
} from '@icons-pack/react-simple-icons';
import { ArrowRight, ExternalLink, Package } from 'lucide-react';
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
    /** Short label for the link, e.g. "Docker Hub". */
    label: string;
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
    { name: string; label: string; icon: RegistrySource['icon'] }
> = {
    'code.forgejo.org': { name: 'Forgejo', label: 'Forgejo', icon: SiForgejo },
    'codeberg.org': { name: 'Codeberg', label: 'Codeberg', icon: SiCodeberg },
};

/** Where an image comes from, and the page that lists its versions when there is one. */
export function registrySource(reference: string): RegistrySource {
    const { registry, path } = parse(reference);

    if (DOCKER_HUB_HOSTS.includes(registry)) {
        const repo = path.replace(/^library\//, '');

        return {
            name: 'Docker Hub',
            label: 'Docker Hub',
            icon: SiDocker,
            url: repo.includes('/')
                ? `https://hub.docker.com/r/${repo}/tags`
                : `https://hub.docker.com/_/${repo}/tags`,
        };
    }

    if (registry === 'ghcr.io') {
        return {
            name: 'GitHub Container Registry',
            label: 'GitHub',
            icon: SiGithub,
            url: `https://ghcr.io/${path}`,
        };
    }

    if (registry === 'quay.io') {
        return {
            name: 'Quay.io',
            label: 'Quay',
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
            label: 'registry.k8s.io',
            icon: SiKubernetes,
            url: null,
        };
    }

    // Named as-is, with no link: the row shows where the image is really pulled
    // from, never a different registry that happens to carry a copy.
    return { name: registry, label: registry, icon: Package, url: null };
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
 * A copyable image reference, labelled with where it's hosted and, where that
 * registry has one, a link to the image's page. An arrow shows the tag an
 * update would install.
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
    // Shown without its tag so only the repository truncates; the tag always stays visible.
    const shown = display(running).split('@')[0];
    const repositoryPart =
        tag !== null ? shown.slice(0, shown.length - tag.length - 1) : shown;
    const unpinned = tag === null || tag === 'latest';
    const nextTag =
        available !== null && available !== running ? tagOf(available) : null;

    return (
        <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
            <span
                className="inline-flex size-5 shrink-0 items-center justify-center text-faint"
                title={`From ${source.name}`}
            >
                <SourceIcon className="size-3.5" />
            </span>
            <span
                className="flex min-w-0 font-mono text-[11px] text-soft select-all"
                title={running}
            >
                <span className="truncate">{repositoryPart}</span>
                {tag !== null && <span className="shrink-0">:{tag}</span>}
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
                {source.url && (
                    <ExternalLinkButton
                        url={source.url}
                        className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium whitespace-nowrap text-brand hover:underline"
                        title={`Open this image on ${source.name} to see every published version`}
                    >
                        <span>{source.label}</span>
                        <ExternalLink className="size-3" />
                    </ExternalLinkButton>
                )}
            </span>
        </div>
    );
}

/**
 * The digest(s) the app's pods actually pulled: the exact image running,
 * which a tag (especially `:latest`) can't prove on its own.
 */
export function PulledDigests({ digests }: { digests: string[] }) {
    if (digests.length === 0) {
        return null;
    }

    return (
        <div className="mt-1 space-y-0.5">
            {digests.length > 1 && (
                <p className="text-[10px] text-warn">
                    Pods are running {digests.length} different builds (an
                    update may be rolling out).
                </p>
            )}
            {digests.map((digest) => (
                <div
                    key={digest}
                    className="flex min-w-0 items-center gap-1.5 text-[10px]"
                >
                    <span className="shrink-0 text-faint">Pulled</span>
                    <span
                        className="truncate font-mono text-soft select-all"
                        title={digest}
                    >
                        {digest.slice(0, 19)}…
                    </span>
                    <CopyButton
                        value={digest}
                        label=""
                        copiedLabel=""
                        title={`Copy ${digest}`}
                        className="ml-auto h-5 px-1"
                    />
                </div>
            ))}
        </div>
    );
}
