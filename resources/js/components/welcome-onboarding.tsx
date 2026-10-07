import { useState, useEffect } from 'react';
import { Link } from '@inertiajs/react';
import {
    Server,
    Wrench,
    FolderGit2,
    ArrowRight,
    Sparkles,
    X,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import { create as createProject } from '@/routes/projects';
import {
    create as createServer,
    index as serversIndex,
} from '@/routes/servers';
import { tools as toolsRoute } from '@/routes';

type Props = {
    serversCount: number;
    projectsCount: number;
    onImportKubeconfig?: () => void;
};

export default function WelcomeOnboarding({
    serversCount,
    projectsCount,
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
            <div className="mb-6 flex items-center justify-between rounded-xl border border-line bg-surface/80 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-soft">
                    <Sparkles className="size-3.5 text-brand" />
                    <span>
                        New to LaraKube? View the interactive getting started
                        walkthrough.
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
                    Show onboarding guide
                </button>
            </div>
        );
    }

    return (
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {/* Ambient Background Glows inspired by the 4 logo cubes */}
            <div className="pointer-events-none absolute -top-24 -left-24 size-72 animate-pulse rounded-full bg-brand/10 blur-3xl" />
            <div
                className="pointer-events-none absolute -right-24 -bottom-24 size-72 animate-pulse rounded-full bg-tools/10 blur-3xl"
                style={{ animationDelay: '1s' }}
            />
            <div className="pointer-events-none absolute top-1/2 left-1/3 size-64 rounded-full bg-servers/10 blur-3xl" />

            <div className="relative p-6 sm:p-8">
                {/* Dismiss Button */}
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Dismiss guide"
                    className="absolute top-5 right-5 rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                >
                    <X className="size-4" />
                </button>

                {/* Hero Section with Animated Logo Emblem */}
                <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
                    {/* 4-Cube Animated Emblem */}
                    <div className="relative flex size-20 shrink-0 items-center justify-center rounded-2xl bg-paper shadow-xs ring-1 ring-line/80">
                        <div className="grid grid-cols-2 gap-1.5 p-2">
                            {/* Cube 1: Blue (Projects / K8s) */}
                            <div
                                className="size-6 animate-bounce rounded-md bg-[#5683e0] shadow-sm transition-all duration-700 hover:scale-110 hover:shadow-brand/40"
                                style={{ animationDuration: '3s' }}
                            />
                            {/* Cube 2: Red (CLI / Setup) */}
                            <div
                                className="size-6 animate-bounce rounded-md bg-[#d6412d] shadow-sm transition-all duration-700 hover:scale-110 hover:shadow-accent/40"
                                style={{
                                    animationDuration: '3.4s',
                                    animationDelay: '0.4s',
                                }}
                            />
                            {/* Cube 3: Cyan (Servers / Cloud) */}
                            <div
                                className="size-6 animate-bounce rounded-md bg-[#2c9fc0] shadow-sm transition-all duration-700 hover:scale-110 hover:shadow-servers/40"
                                style={{
                                    animationDuration: '3.2s',
                                    animationDelay: '0.8s',
                                }}
                            />
                            {/* Cube 4: Purple (Cluster Tools) */}
                            <div
                                className="size-6 animate-bounce rounded-md bg-[#8457e0] shadow-sm transition-all duration-700 hover:scale-110 hover:shadow-tools/40"
                                style={{
                                    animationDuration: '3.6s',
                                    animationDelay: '1.2s',
                                }}
                            />
                        </div>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                                <Sparkles className="size-3" />
                                <span>Quickstart Journey</span>
                            </span>
                            <span className="text-xs text-soft">
                                Welcome to LaraKube Desktop
                            </span>
                        </div>
                        <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
                            Get started with your Kubernetes fleet
                        </h2>
                        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-soft sm:text-sm">
                            Follow these three core steps to bring up
                            high-performance infrastructure, host multi-instance
                            companion tools, and deploy Laravel applications.
                        </p>
                    </div>
                </div>

                {/* 3 Step Cards Grid */}
                <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {/* Step 1: Connect Server */}
                    <div className="group relative flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4.5 transition hover:border-servers/40 hover:bg-surface hover:shadow-sm">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="flex size-8 items-center justify-center rounded-lg bg-servers text-white shadow-xs">
                                    <Server className="size-4" />
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-soft">
                                    01
                                </span>
                            </div>
                            <h3 className="mt-3.5 text-sm font-semibold text-ink group-hover:text-servers">
                                1. Connect or Provision Server
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-soft">
                                Spin up a cluster via DigitalOcean, Hetzner,
                                AWS, or local K3d, or drag-and-drop an existing
                                kubeconfig.
                            </p>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/50 pt-2">
                            <Link
                                href={createServer().url}
                                className={buttonClass(
                                    'primary',
                                    'sm',
                                    'gap-1',
                                )}
                            >
                                <span>Create Server</span>
                                <ArrowRight className="size-3" />
                            </Link>
                            {onImportKubeconfig ? (
                                <button
                                    type="button"
                                    onClick={onImportKubeconfig}
                                    className={buttonClass('ghost', 'sm')}
                                >
                                    Import Kubeconfig
                                </button>
                            ) : (
                                <Link
                                    href={serversIndex().url}
                                    className={buttonClass('ghost', 'sm')}
                                >
                                    View Servers
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Cluster Tools */}
                    <div className="group relative flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4.5 transition hover:border-tools/40 hover:bg-surface hover:shadow-sm">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="flex size-8 items-center justify-center rounded-lg bg-tools text-white shadow-xs">
                                    <Wrench className="size-4" />
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-soft">
                                    02
                                </span>
                            </div>
                            <h3 className="mt-3.5 text-sm font-semibold text-ink group-hover:text-tools">
                                2. Install Cluster Tools
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-soft">
                                Equip your servers with PocketBase, Vaultwarden,
                                Matrix, Uptime Kuma, Stalwart Mail, and more in
                                1-click.
                            </p>
                        </div>
                        <div className="mt-4 flex items-center gap-2 border-t border-line/50 pt-2">
                            <Link
                                href={toolsRoute().url}
                                className={buttonClass(
                                    'secondary',
                                    'sm',
                                    'gap-1',
                                )}
                            >
                                <span>Browse Catalog</span>
                                <ArrowRight className="size-3" />
                            </Link>
                        </div>
                    </div>

                    {/* Step 3: Projects */}
                    <div className="group relative flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4.5 transition hover:border-brand/40 hover:bg-surface hover:shadow-sm">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white shadow-xs">
                                    <FolderGit2 className="size-4" />
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-soft">
                                    03
                                </span>
                            </div>
                            <h3 className="mt-3.5 text-sm font-semibold text-ink group-hover:text-brand">
                                3. Ship Applications
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-soft">
                                Deploy your Laravel repositories with zero
                                downtime, automated SSL, and shared storage
                                parity.
                            </p>
                        </div>
                        <div className="mt-4 flex items-center gap-2 border-t border-line/50 pt-2">
                            <Link
                                href={createProject().url}
                                className={buttonClass(
                                    'secondary',
                                    'sm',
                                    'gap-1',
                                )}
                            >
                                <span>New Project</span>
                                <ArrowRight className="size-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
