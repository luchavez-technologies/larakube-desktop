import { Head, Link, usePage } from '@inertiajs/react';
import { useEffect, type ComponentType, type ReactNode } from 'react';
import {
    LayoutDashboard,
    FolderGit2,
    Server,
    Wrench,
    Activity,
    Terminal,
    Settings,
    Code2,
} from 'lucide-react';
import { listenForNotificationClicks } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { dashboard, readiness, tools } from '@/routes';
import { index as projectsIndex } from '@/routes/projects';
import { index as runsIndex } from '@/routes/runs';
import { index as serversIndex } from '@/routes/servers';
import { show as settingsShow } from '@/routes/settings';
import { index as devBoxesIndex } from '@/routes/devboxes';
import RunDrawer from '@/components/run-drawer';

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
        active: (url) => url.startsWith('/servers') && !url.includes('/tools'),
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
        description: 'Experimental',
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
    }>();
    useEffect(listenForNotificationClicks, []);

    const hideProjects = Boolean(props.hideProjects);
    const visibleNavigation = navigation.filter(
        (item) =>
            !(hideProjects && item.label === 'Projects') &&
            (!item.experimental || Boolean(props.experimental)),
    );

    return (
        <div className="flex min-h-screen">
            <Head title={title} />
            <aside className="sticky top-0 flex h-screen w-58 shrink-0 flex-col border-r border-line bg-surface px-3.5 py-5">
                <div className="mb-5 flex items-center gap-2.5 px-2.5">
                    <img
                        src="/logo.png"
                        alt="LaraKube"
                        className="size-8 rounded-lg shadow-2xs"
                    />
                    <span className="text-[15px] font-semibold tracking-tight">
                        LaraKube
                    </span>
                </div>
                <nav className="flex flex-col gap-1">
                    {visibleNavigation.map((item) => {
                        const active = item.active(url);
                        const Icon = item.icon;
                        const body = (
                            <>
                                <span
                                    className={cn(
                                        'flex size-7.5 items-center justify-center rounded-lg text-white shadow-xs',
                                        item.accent,
                                    )}
                                >
                                    <Icon className="size-4" />
                                </span>
                                <span className="leading-tight">
                                    <span className="block text-sm font-medium">
                                        {item.label}
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
            </aside>
            <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
            <RunDrawer />
        </div>
    );
}
