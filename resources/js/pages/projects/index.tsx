import { Link, usePage } from '@inertiajs/react';
import { buttonClass } from '@/components/button';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { show, store } from '@/routes/projects';
import type { Project } from '@/types/larakube';

export default function ProjectsIndex({ projects }: { projects: Project[] }) {
    const { errors } = usePage().props as { errors: Record<string, string> };

    return (
        <AppLayout title="Projects">
            <PageHeader
                title="Projects"
                subtitle="Your app folders. Link one to a server and deploy it: Laravel, Statamic, WordPress, Next.js, Vite, Astro and Docusaurus."
                actions={
                    <Link
                        href={store().url}
                        method="post"
                        as="button"
                        className={buttonClass('primary')}
                    >
                        Add project
                    </Link>
                }
            />
            {errors.path && (
                <p className="mb-4 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent">
                    {errors.path}
                </p>
            )}
            {projects.length === 0 ? (
                <div className="rounded-2xl bg-surface px-8 py-14 text-center ring-1 ring-line ring-inset">
                    <p className="text-lg font-semibold tracking-[-0.015em]">
                        No projects yet
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-soft">
                        Choose the folder of an app you want to put online.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                    {projects.map((project) => (
                        <Link
                            key={project.id}
                            href={show(project.id).url}
                            className="rounded-xl bg-surface p-4 ring-1 ring-line ring-inset hover:ring-faint"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="truncate text-sm font-semibold">
                                    {project.name}
                                </span>
                                <StatusPill
                                    tone={
                                        project.webHost && project.serverIp
                                            ? 'ok'
                                            : project.initialized
                                              ? 'warn'
                                              : 'muted'
                                    }
                                >
                                    {project.webHost && project.serverIp
                                        ? 'Ready to deploy'
                                        : project.initialized
                                          ? 'Needs a server'
                                          : 'Not set up'}
                                </StatusPill>
                            </div>
                            <p className="mt-1 text-xs text-soft">
                                {project.framework ??
                                    project.detectedFramework ??
                                    'Unknown framework'}
                            </p>
                            <p className="mt-2 truncate font-mono text-[11px] text-faint">
                                {project.path}
                            </p>
                        </Link>
                    ))}
                </div>
            )}
        </AppLayout>
    );
}
