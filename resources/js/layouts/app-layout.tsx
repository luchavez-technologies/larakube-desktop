import { Head, Link, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { readiness, tools } from '@/routes';
import { index as projectsIndex } from '@/routes/projects';
import { index as runsIndex } from '@/routes/runs';
import { index as serversIndex } from '@/routes/servers';

type NavItem = {
    label: string;
    description: string;
    href: string | null;
    active: (url: string) => boolean;
    accent: string;
    glyph: string;
};

const navigation: NavItem[] = [
    {
        label: 'Setup',
        description: 'Tools & logins',
        href: readiness().url,
        active: (url) => url.startsWith('/readiness'),
        accent: 'bg-setup',
        glyph: '>_',
    },
    {
        label: 'Servers',
        description: 'Create & manage',
        href: serversIndex().url,
        active: (url) => url.startsWith('/servers') && !url.includes('/tools'),
        accent: 'bg-servers',
        glyph: '↑',
    },
    {
        label: 'Projects',
        description: 'Deploy your apps',
        href: projectsIndex().url,
        active: (url) => url.startsWith('/projects'),
        accent: 'bg-brand',
        glyph: '▲',
    },
    {
        label: 'Tools',
        description: 'Cluster Tools',
        href: tools().url,
        active: (url) =>
            url.startsWith('/tools') || /^\/servers\/[^/]+\/tools/.test(url),
        accent: 'bg-tools',
        glyph: '∿',
    },
    {
        label: 'Activity',
        description: 'Recent runs',
        href: runsIndex().url,
        active: (url) => url.startsWith('/runs'),
        accent: 'bg-zinc-500',
        glyph: '≡',
    },
];

export default function AppLayout({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    const { url } = usePage();

    return (
        <div className="flex min-h-screen">
            <Head title={title} />
            <aside className="sticky top-0 flex h-screen w-58 shrink-0 flex-col border-r border-line bg-surface px-3.5 py-5">
                <div className="mb-5 flex items-center gap-2.5 px-2.5">
                    <img src="/icon.png" alt="" className="size-8" />
                    <span className="text-[15px] font-semibold">LaraKube</span>
                </div>
                <nav className="flex flex-col gap-1">
                    {navigation.map((item) => {
                        const active = item.active(url);
                        const body = (
                            <>
                                <span
                                    className={cn(
                                        'flex size-7.5 items-center justify-center rounded-lg font-mono text-xs font-medium text-white',
                                        item.accent,
                                    )}
                                >
                                    {item.glyph}
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
        </div>
    );
}
