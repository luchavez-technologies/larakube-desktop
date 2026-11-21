import { useState, useEffect, useRef } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { motion, useReducedMotion } from 'motion/react';
import {
    ArrowLeft,
    ArrowRight,
    Store,
    Rocket,
    Sparkles,
    X,
    Zap,
} from 'lucide-react';
import { buttonClass } from '@/components/button';
import Button from '@/components/button';
import FrameworkLogo from '@/components/framework-logo';
import ToolLogo from '@/components/tool-logo';
import CommonsCapabilityPills from '@/components/commons-capability-pills';
import QuickLaunchModal, {
    type QuickLaunchAppId,
} from '@/components/quick-launch-modal';
import QuickLaunchProjectsModal, {
    QUICK_LAUNCH_PROJECT_IDS,
    type QuickLaunchProjectId,
} from '@/components/quick-launch-projects-modal';
import ExperimentalBadge from '@/components/experimental-badge';
import { tools as toolsRoute } from '@/routes';
import {
    estimateToolFit,
    formatMemoryBytes,
    type ToolFootprint,
} from '@/lib/capacity';
import { cn } from '@/lib/utils';
import type {
    FrameworkCatalog,
    Server,
    ToolCommonsCapabilities,
    Untested,
} from '@/types/larakube';

interface QuickActionApp {
    id: QuickLaunchAppId;
    name: string;
    tagline: string;
    description: string;
    capabilities: ToolCommonsCapabilities;
}

const POCKETBASE_FLIP_APP: QuickActionApp = {
    id: 'pocketbase',
    name: 'PocketBase',
    tagline: 'Embedded Backend & Auth',
    description:
        'Lightweight single-binary backend with embedded SQLite, realtime, auth, and S3 storage.',
    capabilities: {
        databases: ['sqlite'],
        cache: [],
        storage: ['s3'],
        auth: [],
        mail: [],
    },
};

const FEATURED_APPS: QuickActionApp[] = [
    {
        id: 'supabase',
        name: 'Supabase',
        tagline: 'Postgres, Auth, Storage & Realtime',
        description:
            'Self-hosted Postgres with pgvector, GoTrue Auth, PostgREST, Storage, and Studio.',
        // Its Postgres is its own (one per install), not a Commons tenant, so no database pill.
        capabilities: {
            databases: [],
            cache: [],
            storage: ['s3'],
            auth: [],
            mail: ['smtp'],
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
    /** What each app requests, measured by the CLI (tool:catalog), keyed by slug. */
    footprints?: Record<string, ToolFootprint>;
    serversCount: number;
    projectsCount: number;
    activeCommonsServices?: string[];
    onImportKubeconfig?: () => void;
    projectCatalog?: FrameworkCatalog | null;
    projectDevBoxes?: { name: string; ip: string | null }[];
    defaultProjectParent?: string;
};

/** The best fit among the user's ready servers, or null before any capacity is known. */
function bestFit(
    footprint: ToolFootprint | undefined,
    servers: Server[],
): { server: string; fit: 'fits' | 'tight' | 'wont_fit' } | null {
    const assessed = servers
        .filter((server) => server.status === 'ready' && server.role !== 'dev')
        .map((server) => ({
            server: server.name,
            fit: estimateToolFit(footprint, server.capacity),
        }))
        .filter(
            (
                entry,
            ): entry is {
                server: string;
                fit: 'fits' | 'tight' | 'wont_fit';
            } => entry.fit !== null,
        );

    return (
        assessed.find((entry) => entry.fit === 'fits') ??
        assessed.find((entry) => entry.fit === 'tight') ??
        assessed[0] ??
        null
    );
}

function FitBadge({ fit }: { fit: ReturnType<typeof bestFit> }) {
    if (fit === null || fit.fit === 'wont_fit') {
        return null;
    }

    return (
        <span
            className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                fit.fit === 'fits'
                    ? 'bg-ok/10 text-ok'
                    : 'bg-warn/10 text-warn',
            )}
        >
            {fit.fit === 'fits'
                ? `Fits on ${fit.server}`
                : `Tight on ${fit.server}`}
        </span>
    );
}

export default function WelcomeOnboarding({
    servers = [],
    footprints = {},
    serversCount,
    projectsCount,
    activeCommonsServices = [],
    onImportKubeconfig,
    projectCatalog,
    projectDevBoxes = [],
    defaultProjectParent = '',
}: Props) {
    // The same persona signal that already hides the Projects/Dev Boxes nav
    // items for non-dev users (usage-choice.tsx) — the Tools/Projects switch
    // is dev-only, so it reuses that rather than a new concept.
    const { hideProjects, untested } = usePage<{
        hideProjects: boolean;
        untested: Untested;
    }>().props;
    const [mode, setMode] = useState<'tools' | 'projects'>('tools');
    const [flippedToPocketBase, setFlippedToPocketBase] = useState(false);
    // After a flip, focus goes to the control on the side now showing: the
    // side it left is inert, so focus would otherwise drop to the page.
    const flipToBackRef = useRef<HTMLButtonElement>(null);
    const flipToFrontRef = useRef<HTMLButtonElement>(null);
    const flipRequested = useRef(false);
    useEffect(() => {
        if (!flipRequested.current) {
            return;
        }
        flipRequested.current = false;
        (flippedToPocketBase ? flipToFrontRef : flipToBackRef).current?.focus();
    }, [flippedToPocketBase]);
    const flipTo = (pocketBase: boolean) => {
        flipRequested.current = true;
        setFlippedToPocketBase(pocketBase);
    };
    const shouldReduceMotion = useReducedMotion();

    const [dismissed, setDismissed] = useState(
        () => serversCount > 0 || projectsCount > 0,
    );

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedApp, setSelectedApp] =
        useState<QuickLaunchAppId>('supabase');

    const handleLaunch = (appId: QuickLaunchAppId) => {
        setSelectedApp(appId);
        setModalOpen(true);
    };

    const [projectModalOpen, setProjectModalOpen] = useState(false);
    const [selectedFramework, setSelectedFramework] =
        useState<QuickLaunchProjectId>('laravel');

    const handleLaunchProject = (framework: QuickLaunchProjectId) => {
        setSelectedFramework(framework);
        setProjectModalOpen(true);
    };

    const quickLaunchFrameworks = (projectCatalog?.frameworks ?? []).filter(
        (option) =>
            QUICK_LAUNCH_PROJECT_IDS.includes(
                option.slug as QuickLaunchProjectId,
            ),
    );

    useEffect(() => {
        try {
            if (serversCount > 0 || projectsCount > 0) {
                setDismissed(
                    window.localStorage?.getItem(
                        'larakube_onboarding_force_show',
                    ) !== 'true',
                );
            } else {
                setDismissed(
                    window.localStorage?.getItem(
                        'larakube_onboarding_dismissed',
                    ) === 'true',
                );
            }
        } catch {
            // ignore
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
                        New to LaraKube? 1-Click deploy cluster apps or follow
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

    const renderAppCardContent = (
        app: QuickActionApp,
        footerExtra?: React.ReactNode,
    ) => (
        <>
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
                        <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-xs font-semibold text-ink">
                                {app.name}
                            </h3>
                            {untested.tools.includes(app.id) && (
                                <ExperimentalBadge />
                            )}
                        </div>
                        <p className="truncate text-[10px] text-faint">
                            {app.tagline}
                        </p>
                    </div>
                </div>

                <p className="line-clamp-2 min-h-[30px] text-[11px] text-soft">
                    {app.description}
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                    <CommonsCapabilityPills
                        capabilities={app.capabilities}
                        activeCommonsServices={activeCommonsServices}
                        compact
                    />
                    {footprints[app.id] && (
                        <span className="bg-surface-muted rounded px-1.5 py-0.5 text-[10px] font-medium text-faint">
                            Needs ~
                            {formatMemoryBytes(footprints[app.id].memory_bytes)}{' '}
                            RAM
                        </span>
                    )}
                    <FitBadge fit={bestFit(footprints[app.id], servers)} />
                </div>
            </div>

            <div className="mt-3.5 space-y-2 border-t border-line/60 pt-2.5">
                {footerExtra}
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
        </>
    );

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
                                1-Click Cluster Apps & Infrastructure
                            </span>
                        </div>
                        <h2 className="mt-1 text-lg font-bold tracking-tight text-ink sm:text-xl">
                            Get started with your Kubernetes fleet
                        </h2>
                        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-soft">
                            {hideProjects
                                ? 'Launch production-grade cluster applications with instant wildcard DNS, shared Commons, and high-availability storage.'
                                : 'Launch production-grade cluster applications with instant wildcard DNS and shared Commons, or provision clusters and deploy Laravel apps.'}
                        </p>
                    </div>

                    {/* Quick Action Navigation Links */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
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
                            href={toolsRoute().url}
                            className={buttonClass('secondary', 'sm', 'gap-1')}
                        >
                            <Store className="size-3.5" />
                            <span>Apps Catalog</span>
                            <ArrowRight className="size-3" />
                        </Link>
                    </div>
                </div>

                {/* Quick Launch: tools for everyone, projects (dev-only) via a mode switch */}
                <div className="mt-5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink">
                        {mode === 'tools'
                            ? '1-Click Cluster Apps'
                            : 'Quick Launch Projects'}
                    </p>
                    {!hideProjects && (
                        <div className="inline-flex items-center rounded-lg bg-paper p-0.5 ring-1 ring-line">
                            {(
                                [
                                    { id: 'tools', label: 'Cluster Apps' },
                                    { id: 'projects', label: 'Projects' },
                                ] as const
                            ).map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setMode(tab.id)}
                                    className={cn(
                                        'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                                        mode === tab.id
                                            ? 'bg-surface text-ink shadow-2xs'
                                            : 'text-soft hover:text-ink',
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                    {mode === 'tools'
                        ? FEATURED_APPS.map((app) => {
                              if (app.id === 'supabase') {
                                  const noServerFits =
                                      bestFit(footprints[app.id], servers)
                                          ?.fit === 'wont_fit';
                                  const flipHintFront = (
                                      <button
                                          ref={flipToBackRef}
                                          type="button"
                                          onClick={() => flipTo(true)}
                                          className="inline-flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-amber-600 transition hover:bg-amber-500/10 dark:text-amber-400"
                                      >
                                          <span>
                                              {noServerFits
                                                  ? 'Your servers are short on memory. See the lighter option'
                                                  : 'Running on a small server?'}
                                          </span>
                                          <ArrowRight className="size-3 shrink-0" />
                                      </button>
                                  );

                                  const flipHintBack = (
                                      <button
                                          ref={flipToFrontRef}
                                          type="button"
                                          onClick={() => flipTo(false)}
                                          className="hover:bg-surface-muted inline-flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-soft transition hover:text-ink"
                                      >
                                          <ArrowLeft className="size-3 shrink-0" />
                                          <span>Back to Supabase</span>
                                      </button>
                                  );

                                  if (shouldReduceMotion) {
                                      return (
                                          <div
                                              key="supabase-flip"
                                              className="grid"
                                          >
                                              <motion.div
                                                  animate={{
                                                      opacity:
                                                          flippedToPocketBase
                                                              ? 0
                                                              : 1,
                                                  }}
                                                  transition={{ duration: 0.2 }}
                                                  aria-hidden={
                                                      flippedToPocketBase
                                                  }
                                                  inert={
                                                      flippedToPocketBase
                                                          ? true
                                                          : undefined
                                                  }
                                                  className="col-start-1 row-start-1 flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4 transition duration-150 hover:border-brand/40 hover:bg-surface hover:shadow-xs"
                                              >
                                                  {renderAppCardContent(
                                                      app,
                                                      flipHintFront,
                                                  )}
                                              </motion.div>
                                              <motion.div
                                                  animate={{
                                                      opacity:
                                                          flippedToPocketBase
                                                              ? 1
                                                              : 0,
                                                  }}
                                                  transition={{ duration: 0.2 }}
                                                  aria-hidden={
                                                      !flippedToPocketBase
                                                  }
                                                  inert={
                                                      !flippedToPocketBase
                                                          ? true
                                                          : undefined
                                                  }
                                                  className="col-start-1 row-start-1 flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4 transition duration-150 hover:border-brand/40 hover:bg-surface hover:shadow-xs"
                                              >
                                                  {renderAppCardContent(
                                                      POCKETBASE_FLIP_APP,
                                                      flipHintBack,
                                                  )}
                                              </motion.div>
                                          </div>
                                      );
                                  }

                                  return (
                                      <div
                                          key="supabase-flip"
                                          className="[perspective:1000px]"
                                      >
                                          <motion.div
                                              animate={{
                                                  rotateY: flippedToPocketBase
                                                      ? 180
                                                      : 0,
                                              }}
                                              transition={{
                                                  duration: 0.45,
                                                  ease: [0.22, 1, 0.36, 1],
                                              }}
                                              style={{
                                                  transformStyle: 'preserve-3d',
                                              }}
                                              className="grid h-full"
                                          >
                                              <div
                                                  aria-hidden={
                                                      flippedToPocketBase
                                                  }
                                                  inert={
                                                      flippedToPocketBase
                                                          ? true
                                                          : undefined
                                                  }
                                                  style={{
                                                      backfaceVisibility:
                                                          'hidden',
                                                  }}
                                                  className="col-start-1 row-start-1 flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4 transition duration-150 hover:border-brand/40 hover:bg-surface hover:shadow-xs"
                                              >
                                                  {renderAppCardContent(
                                                      app,
                                                      flipHintFront,
                                                  )}
                                              </div>
                                              <div
                                                  aria-hidden={
                                                      !flippedToPocketBase
                                                  }
                                                  inert={
                                                      !flippedToPocketBase
                                                          ? true
                                                          : undefined
                                                  }
                                                  style={{
                                                      backfaceVisibility:
                                                          'hidden',
                                                      transform:
                                                          'rotateY(180deg)',
                                                  }}
                                                  className="col-start-1 row-start-1 flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4 transition duration-150 hover:border-brand/40 hover:bg-surface hover:shadow-xs"
                                              >
                                                  {renderAppCardContent(
                                                      POCKETBASE_FLIP_APP,
                                                      flipHintBack,
                                                  )}
                                              </div>
                                          </motion.div>
                                      </div>
                                  );
                              }

                              return (
                                  <div
                                      key={app.id}
                                      className="flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4 transition duration-150 hover:border-brand/40 hover:bg-surface hover:shadow-xs"
                                  >
                                      {renderAppCardContent(app)}
                                  </div>
                              );
                          })
                        : quickLaunchFrameworks.length === 0
                          ? projectCatalog === null
                              ? null
                              : [0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="h-[170px] animate-pulse rounded-xl bg-paper"
                                    />
                                ))
                          : quickLaunchFrameworks.map((option) => (
                                <div
                                    key={option.slug}
                                    className="flex flex-col justify-between rounded-xl border border-line bg-paper/60 p-4 transition duration-150 hover:border-brand/40 hover:bg-surface hover:shadow-xs"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2.5">
                                            <FrameworkLogo
                                                slug={option.slug}
                                                size="md"
                                            />
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <h3 className="truncate text-xs font-semibold text-ink">
                                                        {option.label}
                                                    </h3>
                                                    {untested.frameworks.includes(
                                                        option.slug,
                                                    ) && <ExperimentalBadge />}
                                                </div>
                                                <p className="truncate text-[10px] text-faint">
                                                    {option.tech}
                                                </p>
                                            </div>
                                        </div>

                                        <p className="line-clamp-2 min-h-[30px] text-[11px] text-soft">
                                            {option.description}
                                        </p>
                                    </div>

                                    <div className="mt-3.5 border-t border-line/60 pt-2.5">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="w-full justify-center"
                                            onClick={() =>
                                                handleLaunchProject(
                                                    option.slug as QuickLaunchProjectId,
                                                )
                                            }
                                        >
                                            <Rocket className="size-3.5" />
                                            <span>Quick Launch</span>
                                        </Button>
                                    </div>
                                </div>
                            ))}
                </div>

                {/* Helpful Footnote */}
                <div className="mt-3.5 flex items-center justify-between text-[11px] text-soft">
                    <span>
                        💡 Once deployed, manage and inspect all cluster apps,
                        mailboxes, and routing in the Apps page.
                    </span>
                </div>
            </div>

            <QuickLaunchModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                initialApp={selectedApp}
                servers={servers}
                activeCommonsServices={activeCommonsServices}
            />

            <QuickLaunchProjectsModal
                isOpen={projectModalOpen}
                onClose={() => setProjectModalOpen(false)}
                initialFramework={selectedFramework}
                catalog={projectCatalog}
                devBoxes={projectDevBoxes}
                defaultParent={defaultProjectParent}
            />
        </div>
    );
}
