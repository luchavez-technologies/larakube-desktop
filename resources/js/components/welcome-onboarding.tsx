import { useState, useEffect } from 'react';
import { Link } from '@inertiajs/react';
import { Sparkles, X, Zap, Plus, ArrowRight } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Button from '@/components/button';
import ToolLogo from '@/components/tool-logo';
import CommonsCapabilityPills from '@/components/commons-capability-pills';
import QuickLaunchModal, {
    type QuickLaunchAppId,
} from '@/components/quick-launch-modal';
import { create as createProject } from '@/routes/projects';
import { create as createServer } from '@/routes/servers';
import { tools as toolsRoute } from '@/routes';
import type { Server, ToolCommonsCapabilities } from '@/types/larakube';

interface QuickActionApp {
    id: QuickLaunchAppId;
    name: string;
    tagline: string;
    description: string;
    capabilities: ToolCommonsCapabilities;
}

const FEATURED_APPS: QuickActionApp[] = [
    {
        id: 'pocketbase',
        name: 'PocketBase',
        tagline: 'Embedded Backend & Auth',
        description:
            'Instant REST & Realtime backend with embedded SQLite, auth, and S3 file storage.',
        capabilities: {
            databases: ['sqlite'],
            cache: [],
            storage: ['s3'],
            auth: [],
            mail: [],
        },
    },
    {
        id: 'n8n',
        name: 'n8n Automation',
        tagline: 'Workflow Automation',
        description:
            'Connect 400+ nodes and APIs. Zero-RAM SQLite or high-scale Plex PostgreSQL.',
        capabilities: {
            databases: ['sqlite', 'postgresql'],
            cache: ['redis'],
            storage: ['s3'],
            auth: [],
            mail: [],
        },
    },
    {
        id: 'wordpress',
        name: 'WordPress',
        tagline: "World's #1 CMS",
        description:
            'Blazing fast ServerSideUp FrankenPHP pod with zero-RAM SQLite or Plex MySQL.',
        capabilities: {
            databases: ['sqlite', 'mysql', 'mariadb'],
            cache: [],
            storage: ['s3'],
            auth: [],
            mail: ['smtp'],
        },
    },
];

type Props = {
    servers?: Server[];
    serversCount: number;
    projectsCount: number;
    activeCommonsServices?: string[];
    onImportKubeconfig?: () => void;
};

export default function WelcomeOnboarding({
    servers = [],
    serversCount,
    projectsCount,
    activeCommonsServices = [],
    onImportKubeconfig,
}: Props) {
    const [dismissed, setDismissed] = useState(() => {
        if (serversCount > 0 || projectsCount > 0) {
            return (
                localStorage.getItem('larakube_onboarding_force_show') !==
                'true'
            );
        }
        return localStorage.getItem('larakube_onboarding_dismissed') === 'true';
    });

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedApp, setSelectedApp] =
        useState<QuickLaunchAppId>('pocketbase');

    const handleLaunch = (appId: QuickLaunchAppId) => {
        setSelectedApp(appId);
        setModalOpen(true);
    };

    useEffect(() => {
        if (serversCount > 0 || projectsCount > 0) {
            if (
                localStorage.getItem('larakube_onboarding_force_show') !==
                'true'
            ) {
                setDismissed(true);
            }
        }
    }, [serversCount, projectsCount]);

    const handleDismiss = () => {
        setDismissed(true);
        localStorage.setItem('larakube_onboarding_dismissed', 'true');
        localStorage.removeItem('larakube_onboarding_force_show');
    };

    if (dismissed) {
        return (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-line bg-surface/80 px-4 py-2.5 shadow-2xs">
                <div className="flex items-center gap-2 text-xs text-soft">
                    <Sparkles className="size-3.5 text-brand" />
                    <span>
                        New to LaraKube? 1-Click deploy companion apps or follow
                        the quickstart journey.
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setDismissed(false);
                        localStorage.setItem(
                            'larakube_onboarding_force_show',
                            'true',
                        );
                        localStorage.removeItem(
                            'larakube_onboarding_dismissed',
                        );
                    }}
                    className="text-xs font-medium text-brand hover:underline"
                >
                    Show quickstart guide
                </button>
            </div>
        );
    }

    return (
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {/* Ambient Background Glows */}
            <div className="pointer-events-none absolute -top-24 -left-24 size-72 animate-pulse rounded-full bg-brand/10 blur-3xl" />
            <div
                className="pointer-events-none absolute -right-24 -bottom-24 size-72 animate-pulse rounded-full bg-tools/10 blur-3xl"
                style={{ animationDelay: '1s' }}
            />
            <div className="pointer-events-none absolute top-1/2 left-1/3 size-64 rounded-full bg-servers/10 blur-3xl" />

            <div className="relative p-5 sm:p-6">
                {/* Dismiss Button */}
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Dismiss guide"
                    className="absolute top-4 right-4 rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                >
                    <X className="size-4" />
                </button>

                {/* Hero Header */}
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    {/* 4-Cube Animated Emblem */}
                    <div className="relative flex size-14 shrink-0 items-center justify-center rounded-xl bg-paper shadow-2xs ring-1 ring-line/80">
                        <div className="grid grid-cols-2 gap-1 p-1.5">
                            <div
                                className="size-4 animate-bounce rounded-xs bg-[#5683e0] shadow-2xs transition-all duration-700 hover:scale-110"
                                style={{ animationDuration: '3s' }}
                            />
                            <div
                                className="size-4 animate-bounce rounded-xs bg-[#d6412d] shadow-2xs transition-all duration-700 hover:scale-110"
                                style={{
                                    animationDuration: '3.4s',
                                    animationDelay: '0.4s',
                                }}
                            />
                            <div
                                className="size-4 animate-bounce rounded-xs bg-[#2c9fc0] shadow-2xs transition-all duration-700 hover:scale-110"
                                style={{
                                    animationDuration: '3.2s',
                                    animationDelay: '0.8s',
                                }}
                            />
                            <div
                                className="size-4 animate-bounce rounded-xs bg-[#8457e0] shadow-2xs transition-all duration-700 hover:scale-110"
                                style={{
                                    animationDuration: '3.6s',
                                    animationDelay: '1.2s',
                                }}
                            />
                        </div>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                                <Sparkles className="size-3" />
                                <span>Quickstart Journey</span>
                            </span>
                            <span className="text-xs text-soft">
                                1-Click Companions & Infrastructure
                            </span>
                        </div>
                        <h2 className="mt-1 text-lg font-bold tracking-tight text-ink sm:text-xl">
                            Get started with your Kubernetes fleet
                        </h2>
                        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-soft">
                            Launch production-grade companion applications with
                            instant wildcard DNS and shared Commons, or
                            provision clusters and deploy Laravel apps.
                        </p>
                    </div>

                    {/* Quick Action Navigation Links */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                        <Link
                            href={createServer().url}
                            className={buttonClass('secondary', 'sm', 'gap-1')}
                        >
                            <Plus className="size-3.5" />
                            <span>Server</span>
                        </Link>
                        {onImportKubeconfig && (
                            <button
                                type="button"
                                onClick={onImportKubeconfig}
                                className={buttonClass('ghost', 'sm', 'gap-1')}
                            >
                                <span>Import Kubeconfig</span>
                            </button>
                        )}
                        <Link
                            href={createProject().url}
                            className={buttonClass('secondary', 'sm', 'gap-1')}
                        >
                            <Plus className="size-3.5" />
                            <span>Project</span>
                        </Link>
                        <Link
                            href={toolsRoute().url}
                            className={buttonClass('ghost', 'sm', 'gap-1')}
                        >
                            <span>Tools Catalog</span>
                            <ArrowRight className="size-3" />
                        </Link>
                    </div>
                </div>

                {/* 1-Click Companion Apps Grid */}
                <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                    {FEATURED_APPS.map((app) => (
                        <div
                            key={app.id}
                            className="flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4 transition duration-150 hover:border-brand/40 hover:bg-surface hover:shadow-xs"
                        >
                            <div className="space-y-2">
                                <div className="flex items-center gap-2.5">
                                    <ToolLogo
                                        tool={{
                                            tool: app.id,
                                            icon: '*',
                                            label: app.name,
                                            brand: app.name,
                                            installed: false,
                                            instance: '',
                                            namespace: '',
                                            host: null,
                                            url: null,
                                            installedAt: null,
                                            sso: '—',
                                            mail: 'N/A',
                                            vpn: 'N/A',
                                            sync: 'N/A',
                                            rotation: 'N/A',
                                        }}
                                        size="md"
                                    />
                                    <div className="min-w-0">
                                        <h3 className="truncate text-xs font-semibold text-ink">
                                            {app.name}
                                        </h3>
                                        <p className="truncate text-[10px] text-faint">
                                            {app.tagline}
                                        </p>
                                    </div>
                                </div>

                                <p className="line-clamp-2 min-h-[30px] text-[11px] text-soft">
                                    {app.description}
                                </p>

                                <CommonsCapabilityPills
                                    capabilities={app.capabilities}
                                    activeCommonsServices={
                                        activeCommonsServices
                                    }
                                    compact
                                />
                            </div>

                            <div className="mt-3.5 border-t border-line/60 pt-2.5">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="w-full justify-center"
                                    onClick={() => handleLaunch(app.id)}
                                >
                                    <Zap className="size-3.5" />
                                    <span>Quick Launch</span>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Helpful Footnote */}
                <div className="mt-3.5 flex items-center justify-between text-[11px] text-soft">
                    <span>
                        💡 Once deployed, manage and inspect all cluster tools,
                        mailboxes, and routing in the Tools page.
                    </span>
                    <Link
                        href={toolsRoute().url}
                        className="font-medium text-brand hover:underline"
                    >
                        Browse all companion tools →
                    </Link>
                </div>
            </div>

            <QuickLaunchModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                initialApp={selectedApp}
                servers={servers}
                activeCommonsServices={activeCommonsServices}
            />
        </div>
    );
}
