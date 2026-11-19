import { Head, Link } from '@inertiajs/react';
import { House, ServerCrash } from 'lucide-react';
import { buttonClass } from '@/components/button';
import { index as projectsIndex } from '@/routes/projects';
import { index as serversIndex } from '@/routes/servers';

const COPY: Record<number, { badge: string; title: string; body: string }> = {
    403: {
        badge: '403 • Forbidden',
        title: 'Not Allowed',
        body: "LaraKube Desktop couldn't open this page.",
    },
    404: {
        badge: '404 • Not Found',
        title: 'Resource Not Found',
        body: 'The requested server, cluster, or project could not be found. It may have been renamed, removed, or the connection details updated.',
    },
};

/**
 * The error page for Inertia visits. Without it, Inertia shows the HTML error
 * page in a modal frame, where its links can't navigate the app.
 */
export default function ErrorPage({ status }: { status: number }) {
    const copy = COPY[status] ?? COPY[404];

    return (
        <>
            <Head title={copy.title} />
            <div className="flex min-h-[70vh] items-center justify-center p-6">
                <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-8 text-center shadow-xl">
                    <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-line bg-paper shadow-xs">
                        <ServerCrash className="size-8 text-brand" />
                    </div>
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent ring-1 ring-accent/20">
                            {copy.badge}
                        </div>
                        <h1 className="text-xl font-bold tracking-tight text-ink">
                            {copy.title}
                        </h1>
                        <p className="text-xs leading-relaxed text-soft">
                            {copy.body}
                        </p>
                    </div>
                    <div className="flex flex-col justify-center gap-2.5 sm:flex-row">
                        <Link
                            href={serversIndex().url}
                            className={buttonClass('primary', 'md')}
                        >
                            <ServerCrash className="size-4" />
                            <span>View Servers</span>
                        </Link>
                        <Link
                            href={projectsIndex().url}
                            className={buttonClass('secondary', 'md')}
                        >
                            <House className="size-4" />
                            <span>Return to Projects</span>
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
