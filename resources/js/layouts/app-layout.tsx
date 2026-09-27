import { Head, Link, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { readiness } from '@/routes';
import { create as createServer } from '@/routes/servers';

type NavItem = {
    label: string;
    description: string;
    href: string | null;
    match: string;
    accent: string;
    glyph: string;
};

const navigation: NavItem[] = [
    {
        label: 'Setup',
        description: 'Tools & logins',
        href: readiness().url,
        match: '/readiness',
        accent: 'bg-setup-500',
        glyph: '>_',
    },
    {
        label: 'Servers',
        description: 'Create & manage',
        href: createServer().url,
        match: '/servers',
        accent: 'bg-servers-500',
        glyph: '↑',
    },
    {
        label: 'Tools',
        description: 'Coming soon',
        href: null,
        match: '/tools',
        accent: 'bg-tools-500',
        glyph: '∿',
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
        <div className="flex min-h-screen text-slate-900">
            <Head title={title} />
            <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5">
                <div className="mb-8 flex items-center gap-2.5 px-2">
                    <img src="/logo.png" alt="" className="size-9" />
                    <div className="leading-tight">
                        <div className="text-sm font-semibold">LaraKube</div>
                        <div className="text-xs text-slate-500">Desktop</div>
                    </div>
                </div>
                <nav className="flex flex-col gap-1">
                    {navigation.map((item) => {
                        const active = url.startsWith(item.match);
                        const body = (
                            <>
                                <span
                                    className={cn(
                                        'flex size-8 items-center justify-center rounded-lg font-mono text-xs font-bold text-white',
                                        item.accent,
                                    )}
                                >
                                    {item.glyph}
                                </span>
                                <span className="leading-tight">
                                    <span className="block text-sm font-medium">
                                        {item.label}
                                    </span>
                                    <span className="block text-xs text-slate-500">
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
                                    'flex items-center gap-3 rounded-xl px-2 py-2 transition',
                                    active
                                        ? 'bg-brand-50'
                                        : 'hover:bg-slate-50',
                                )}
                            >
                                {body}
                            </Link>
                        ) : (
                            <div
                                key={item.label}
                                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-2 py-2 opacity-50"
                            >
                                {body}
                            </div>
                        );
                    })}
                </nav>
            </aside>
            <main className="min-w-0 flex-1 px-10 py-8">
                <h1 className="mb-6 text-2xl font-semibold tracking-tight">
                    {title}
                </h1>
                {children}
            </main>
        </div>
    );
}
