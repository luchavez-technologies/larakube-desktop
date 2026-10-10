import { Form } from '@inertiajs/react';
import { Database, Layers, Server as ServerIcon, Globe } from 'lucide-react';
import Button from '@/components/button';
import type { Server } from '@/types/larakube';

export default function PlexEmptyState({ server }: { server: Server }) {
    return (
        <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
            <div className="max-w-2xl">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-tools-tint text-tools ring-1 ring-tools/20">
                    <Layers className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-ink">
                    Initialize Plex Commons on {server.name}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-soft">
                    A shared Postgres, Redis, and S3-compatible object store for
                    tenant apps and Cluster Tools on this server. Saves cluster
                    memory and avoids a duplicate database pod per project.
                </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-surface p-4">
                    <Database className="mb-2 h-5 w-5 text-brand" />
                    <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                        Shared database & cache
                    </h3>
                    <p className="mt-1 text-xs text-soft">
                        One Postgres (or MySQL/MariaDB) and Redis instance, with
                        a per-tenant login and logical DB index.
                    </p>
                </div>

                <div className="rounded-xl border border-line bg-surface p-4">
                    <Globe className="mb-2 h-5 w-5 text-sky-500" />
                    <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                        S3-compatible storage
                    </h3>
                    <p className="mt-1 text-xs text-soft">
                        A per-tenant bucket on the shared object store, so
                        projects don&apos;t each run their own MinIO pod.
                    </p>
                </div>

                <div className="rounded-xl border border-line bg-surface p-4">
                    <ServerIcon className="mb-2 h-5 w-5 text-violet-500" />
                    <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                        On-demand credentials
                    </h3>
                    <p className="mt-1 text-xs text-soft">
                        Provision Commons access for a custom app that isn't a
                        recognized LaraKube project, once initialized.
                    </p>
                </div>
            </div>

            <div className="mt-8 max-w-xl rounded-xl border border-line bg-paper/50 p-5">
                <h3 className="text-sm font-medium text-ink">
                    Initialize Plex Commons
                </h3>
                <p className="mt-1 text-xs text-soft">
                    No domain or name needed — this sets up the shared
                    infrastructure for every tenant on this server.
                </p>

                <Form
                    action={`/servers/${server.name}/plex/init`}
                    method="post"
                    className="mt-4"
                >
                    <Button type="submit" variant="primary">
                        <Layers className="h-4 w-4" />
                        Initialize Plex Commons
                    </Button>
                </Form>
            </div>
        </div>
    );
}
