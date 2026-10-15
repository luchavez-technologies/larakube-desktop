import { Head, Link, usePage } from '@inertiajs/react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
    LayoutDashboard,
    FolderGit2,
    Server,
    Wrench,
    Activity,
    Terminal,
    Settings,
    Code2,
    Mail,
    Layers,
    HardDrive,
    HelpCircle,
    Heart,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';
import { listenForNotificationClicks } from '@/lib/notifications';
import { ExternalLinkButton } from '@/lib/open-external';
import ExperimentalBadge from '@/components/experimental-badge';
import { cn } from '@/lib/utils';
import type { Untested } from '@/types/larakube';
import { dashboard, drive, mail, plex, readiness, tools } from '@/routes';
import { show as helpShow } from '@/routes/help';
import { index as projectsIndex } from '@/routes/projects';
import { index as runsIndex } from '@/routes/runs';
import { index as serversIndex } from '@/routes/servers';
import { show as settingsShow } from '@/routes/settings';
import { index as devBoxesIndex } from '@/routes/devboxes';
import RunDrawer from '@/components/run-drawer';
import NotificationBell from '@/components/notification-bell';

type NavItem = {
    label: string;
    description: string;
    href: string | null;
    active: (url: string) => boolean;
    accent: string;
    icon: ComponentType<{ className?: string }>;
    /** Only listed when Experimental features are switched on in Settings. */
    experimental?: boolean;
};

const navigation: NavItem[] = [
    {
        label: 'Dashboard',
        description: 'Fleet overview',
        href: dashboard().url,
        active: (url) => url === '/' || url.startsWith('/dashboard'),
        accent: 'bg-indigo-600',
        icon: LayoutDashboard,
    },
    {
        label: 'Servers',
        description: 'Create & manage',
        href: serversIndex().url,
        active: (url) =>
            url.startsWith('/servers') &&
            !url.includes('/tools') &&
            !url.includes('/mail') &&
            !url.includes('/plex') &&
            !url.includes('/drive'),
        accent: 'bg-servers',
        icon: Server,
    },
    {
        label: 'Projects',
        description: 'Deploy your apps',
        href: projectsIndex().url,
        active: (url) => url.startsWith('/projects'),
        accent: 'bg-brand',
        icon: FolderGit2,
    },
    {
        label: 'Dev Boxes',
        description: 'Remote dev server',
        href: devBoxesIndex().url,
        active: (url) =>
            url.startsWith('/dev-boxes') || url.startsWith('/workspaces'),
        accent: 'bg-brand',
        icon: Code2,
        experimental: true,
    },
    {
        label: 'Tools',
        description: 'Cluster Tools',
        href: tools().url,
        active: (url) =>
            url.startsWith('/tools') || /^\/servers\/[^/]+\/tools/.test(url),
        accent: 'bg-tools',
        icon: Wrench,
    },
    {
        label: 'Mail',
        description: 'Email & mailboxes',
        href: mail().url,
        active: (url) =>
            url.startsWith('/mail') || /^\/servers\/[^/]+\/mail/.test(url),
        accent: 'bg-emerald-600',
        icon: Mail,
    },
    {
        label: 'Plex Commons',
        description: 'Shared infrastructure',
        href: plex().url,
        active: (url) =>
            url.startsWith('/plex') || /^\/servers\/[^/]+\/plex/.test(url),
        accent: 'bg-violet-600',
        icon: Layers,
    },
    {
        label: 'Drive',
        description: 'Files & office suite',
        href: drive().url,
        active: (url) =>
            url.startsWith('/drive') || /^\/servers\/[^/]+\/drive/.test(url),
        accent: 'bg-sky-600',
        icon: HardDrive,
    },
    {
        label: 'Activity',
        description: 'Recent runs',
        href: runsIndex().url,
        active: (url) => url.startsWith('/runs'),
        accent: 'bg-zinc-600',
        icon: Activity,
    },
    {
        label: 'Setup',
        description: 'Tools & logins',
        href: readiness().url,
        active: (url) => url.startsWith('/readiness'),
        accent: 'bg-setup',
        icon: Terminal,
    },
    {
        label: 'Settings',
        description: 'Global & AI config',
        href: settingsShow().url,
        active: (url) => url.startsWith('/settings'),
        accent: 'bg-slate-600',
        icon: Settings,
    },
    {
        label: 'Help',
        description: 'Community & support',
        href: helpShow().url,
        active: (url) => url.startsWith('/help'),
        accent: 'bg-rose-600',
        icon: HelpCircle,
    },
];

export default function AppLayout({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    const { url, props } = usePage<{
        hideProjects?: boolean;
        experimental?: boolean;
        theme?: string;
        untested?: Untested;
        versions?: {
            desktop: string;
            cli: string | null;
        };
    }>();
    useEffect(listenForNotificationClicks, []);

    useEffect(() => {
        const theme = props.theme || 'system';
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            const isDark =
                theme === 'dark' || (theme === 'system' && media.matches);
            if (isDark) {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
            } else {
                document.documentElement.classList.remove('dark');
                if (theme === 'light') {
                    document.documentElement.classList.add('light');
                } else {
                    document.documentElement.classList.remove('light');
                }
            }
        };

        apply();

        if (theme === 'system') {
            media.addEventListener('change', apply);
            return () => media.removeEventListener('change', apply);
        }
    }, [props.theme]);

    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        try {
            return (
                localStorage.getItem('larakube_sidebar_collapsed') === 'true'
            );
        } catch {
            return false;
        }
    });

    const toggleSidebar = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(
                    'larakube_sidebar_collapsed',
                    String(next),
                );
            } catch {
                // ignore
            }
            return next;
        });
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                const target = e.target as HTMLElement | null;
                if (
                    target &&
                    (target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.isContentEditable)
                ) {
                    return;
                }
                e.preventDefault();
                toggleSidebar();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const hideProjects = Boolean(props.hideProjects);
    const visibleNavigation = navigation.filter(
        (item) =>
            !(
                hideProjects &&
                (item.label === 'Projects' || item.label === 'Dev Boxes')
            ) &&
            (!item.experimental || Boolean(props.experimental)),
    );

    return (
        <div className="flex h-screen overflow-hidden">
            <Head title={title} />
            <aside
                className={cn(
                    'z-30 flex h-full shrink-0 flex-col border-r border-line bg-surface py-5 transition-[width,padding] duration-200 ease-in-out',
                    collapsed ? 'w-16 px-2' : 'w-60 px-3',
                )}
            >
                {collapsed ? (
                    <div className="mb-4 flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleSidebar}
                            className="cursor-pointer rounded-lg p-0.5 transition-transform hover:scale-105 active:scale-95"
                            title={`LaraKube\nDesktop v${props.versions?.desktop ?? '1.0.0'}\nCLI ${props.versions?.cli ? (props.versions.cli.startsWith('v') ? props.versions.cli : `v${props.versions.cli}`) : '—'}\n\n(Click to expand · ⌘B)`}
                            aria-label="Expand sidebar"
                        >
                            <img
                                src="/logo.png"
                                alt="LaraKube"
                                className="size-8 rounded-lg shadow-2xs"
                            />
                        </button>
                        <NotificationBell />
                    </div>
                ) : (
                    <div className="mb-5 flex items-start justify-between px-1">
                        <div className="flex min-w-0 items-start gap-2">
                            <img
                                src="/logo.png"
                                alt="LaraKube"
                                className="mt-0.5 size-8 shrink-0 rounded-lg shadow-2xs"
                            />
                            <div className="min-w-0 leading-tight">
                                <span className="block truncate text-[14px] font-semibold tracking-tight text-ink">
                                    LaraKube
                                </span>
                                <span className="mt-0.5 block font-mono text-[10px] whitespace-nowrap text-faint">
                                    Desktop v
                                    {props.versions?.desktop ?? '1.0.0'}
                                </span>
                                <span className="block font-mono text-[10px] whitespace-nowrap text-faint">
                                    CLI{' '}
                                    {props.versions?.cli
                                        ? props.versions.cli.startsWith('v')
                                            ? props.versions.cli
                                            : `v${props.versions.cli}`
                                        : '—'}
                                </span>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                            <NotificationBell />
                            <button
                                type="button"
                                onClick={toggleSidebar}
                                className="cursor-pointer rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                                title="Collapse sidebar (⌘B)"
                                aria-label="Collapse sidebar"
                            >
                                <PanelLeftClose className="size-4" />
                            </button>
                        </div>
                    </div>
                )}
                <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
                    {visibleNavigation.map((item) => {
                        const active = item.active(url);
                        const Icon = item.icon;
                        const tooltipText = `${item.label}${item.description ? ` · ${item.description}` : ''}`;

                        const iconContent = (
                            <span
                                className={cn(
                                    'flex size-7.5 shrink-0 items-center justify-center rounded-lg text-white shadow-xs',
                                    item.accent,
                                )}
                            >
                                <Icon className="size-4" />
                            </span>
                        );

                        if (collapsed) {
                            return item.href ? (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    prefetch
                                    cacheFor={['30s', '1m']}
                                    className={cn(
                                        'mx-auto flex size-10 items-center justify-center rounded-[10px] transition',
                                        active ? 'bg-badge' : 'hover:bg-paper',
                                    )}
                                    title={tooltipText}
                                    aria-label={item.label}
                                >
                                    {iconContent}
                                </Link>
                            ) : (
                                <div
                                    key={item.label}
                                    className="mx-auto flex size-10 cursor-not-allowed items-center justify-center rounded-[10px] opacity-45"
                                    title={`${item.label} (disabled)`}
                                >
                                    {iconContent}
                                </div>
                            );
                        }

                        const body = (
                            <>
                                {iconContent}
                                <span className="min-w-0 leading-tight">
                                    <span className="flex flex-wrap items-center gap-1 text-sm font-medium">
                                        {item.label}
                                        {item.label === 'Dev Boxes' &&
                                            props.untested?.capabilities.includes(
                                                'dev-boxes',
                                            ) && (
                                                <ExperimentalBadge
                                                    compact
                                                    side="right"
                                                />
                                            )}
                                    </span>
                                    <span className="block text-xs text-soft">
                                        {item.description}
                                    </span>
                                </span>
                            </>
                        );

                        return item.href ? (
                            <Link
                                key={item.label}
                                href={item.href}
                                prefetch
                                cacheFor={['30s', '1m']}
                                className={cn(
                                    'flex items-center gap-3 rounded-[10px] px-2.5 py-2 transition',
                                    active ? 'bg-badge' : 'hover:bg-paper',
                                )}
                            >
                                {body}
                            </Link>
                        ) : (
                            <div
                                key={item.label}
                                className="flex cursor-not-allowed items-center gap-3 rounded-[10px] px-2.5 py-2 opacity-45"
                            >
                                {body}
                            </div>
                        );
                    })}
                </nav>
                <div className="mt-auto space-y-1 border-t border-line/60 pt-3">
                    {collapsed ? (
                        <>
                            <ExternalLinkButton
                                url="https://github.com/sponsors/luchavez-technologies"
                                className="mx-auto flex size-10 cursor-pointer items-center justify-center rounded-lg text-soft transition hover:bg-paper hover:text-ink"
                                title="Sponsor on GitHub"
                                aria-label="Sponsor on GitHub"
                            >
                                <Heart className="size-4 fill-[#ea4aaa]/20 text-[#ea4aaa]" />
                            </ExternalLinkButton>
                            <button
                                type="button"
                                onClick={toggleSidebar}
                                className="mx-auto flex size-10 cursor-pointer items-center justify-center rounded-lg text-soft transition hover:bg-paper hover:text-ink"
                                title="Expand sidebar (⌘B)"
                                aria-label="Expand sidebar"
                            >
                                <PanelLeftOpen className="size-4" />
                            </button>
                        </>
                    ) : (
                        <>
                            <ExternalLinkButton
                                url="https://github.com/sponsors/luchavez-technologies"
                                className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-soft transition hover:bg-paper hover:text-ink"
                            >
                                <span className="flex items-center gap-2">
                                    <Heart className="size-3.5 fill-[#ea4aaa]/20 text-[#ea4aaa]" />
                                    <span>Sponsor</span>
                                </span>
                                <span className="text-[10px] font-medium text-faint">
                                    GitHub
                                </span>
                            </ExternalLinkButton>
                            <button
                                type="button"
                                onClick={toggleSidebar}
                                className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-soft transition hover:bg-paper hover:text-ink"
                                title="Collapse sidebar (⌘B)"
                                aria-label="Collapse sidebar"
                            >
                                <span className="flex items-center gap-2">
                                    <PanelLeftClose className="size-3.5" />
                                    <span>Collapse</span>
                                </span>
                                <kbd className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-faint ring-1 ring-line/50">
                                    ⌘B
                                </kbd>
                            </button>
                        </>
                    )}
                </div>
            </aside>
            <main
                scroll-region="true"
                className="min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-8 lg:px-10 lg:py-8"
            >
                {children}
            </main>
            <RunDrawer />
        </div>
    );
}
