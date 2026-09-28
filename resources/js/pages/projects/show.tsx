import { Form, Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { open } from '@/routes';
import {
    deploy,
    destroy,
    host as setHost,
    index,
    init,
} from '@/routes/projects';
import { show as showRun } from '@/routes/runs';
import { create as createServer, show as showServer } from '@/routes/servers';
import type { Project, RunStatus, Server } from '@/types/larakube';

type RecentRun = {
    id: number;
    label: string;
    status: RunStatus;
    created_at: string;
};

const STATIC = ['vite', 'astro', 'docusaurus'];

export default function ShowProject({
    project,
    server,
    frameworks,
    runs,
}: {
    project: Project;
    server: Server | null;
    frameworks: Record<string, string>;
    runs: RecentRun[];
}) {
    const ready =
        project.initialized &&
        project.deployable &&
        server !== null &&
        project.webHost !== null;

    return (
        <AppLayout title={project.name}>
            <Link
                href={index().url}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Projects
            </Link>
            <PageHeader
                title={project.name}
                badge={
                    project.framework ? (
                        <StatusPill tone="muted">
                            {frameworks[project.framework] ?? project.framework}
                        </StatusPill>
                    ) : undefined
                }
                meta={<span>{project.path}</span>}
                actions={
                    project.webHost && (
                        <Link
                            href={open().url}
                            method="post"
                            data={{ url: `https://${project.webHost}` }}
                            as="button"
                            className={buttonClass('secondary')}
                        >
                            Open site
                        </Link>
                    )
                }
            />

            {!project.exists ? (
                <Card tone="error">
                    <p className="text-sm">
                        This folder no longer exists. Remove the project, or
                        move the folder back.
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-[1fr_320px] items-start gap-4.5">
                    <Card label="Put it online">
                        <Step
                            number={1}
                            title="Set up for LaraKube"
                            done={project.initialized}
                        >
                            {project.initialized ? (
                                <p className="text-xs text-soft">
                                    {project.deployable
                                        ? 'Ready.'
                                        : `LaraKube can't deploy ${project.framework ?? 'this framework'} yet.`}
                                </p>
                            ) : (
                                <InitForm
                                    project={project}
                                    frameworks={frameworks}
                                />
                            )}
                        </Step>
                        <Step number={2} title="Server" done={server !== null}>
                            {server ? (
                                <p className="text-xs text-soft">
                                    <Link
                                        href={showServer(server.name).url}
                                        className="font-medium text-ink hover:underline"
                                    >
                                        {server.name}
                                    </Link>{' '}
                                    · {server.ip}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    <Link
                                        href={
                                            createServer({
                                                query: { project: project.id },
                                            }).url
                                        }
                                        className={buttonClass(
                                            'secondary',
                                            'sm',
                                            !project.initialized
                                                ? 'pointer-events-none opacity-45'
                                                : undefined,
                                        )}
                                    >
                                        Create a server for this project
                                    </Link>
                                    <p className="text-xs text-soft">
                                        Linking an existing server is coming (it
                                        needs a LaraKube CLI update).
                                    </p>
                                </div>
                            )}
                        </Step>
                        <Step
                            number={3}
                            title="Address"
                            done={project.webHost !== null}
                        >
                            <HostForm
                                project={project}
                                serverIp={server?.ip ?? null}
                                disabled={!project.initialized}
                            />
                        </Step>
                        <Step number={4} title="Deploy" done={false} last>
                            <Form action={deploy(project.id)}>
                                {({ processing }) => (
                                    <div className="space-y-2">
                                        <Button
                                            type="submit"
                                            disabled={!ready || processing}
                                        >
                                            {processing
                                                ? 'Starting…'
                                                : 'Deploy'}
                                        </Button>
                                        <p className="text-xs text-soft">
                                            {project.framework &&
                                            STATIC.includes(project.framework)
                                                ? 'Builds the site on this computer and publishes it to the server. Needs Plex Commons on the server.'
                                                : 'Builds the app image on this computer (needs Docker or Podman) and ships it to the server.'}
                                        </p>
                                    </div>
                                )}
                            </Form>
                        </Step>
                    </Card>

                    <div className="flex flex-col gap-4.5">
                        <Card label="Recent runs">
                            {runs.length === 0 ? (
                                <p className="py-2 text-xs text-soft">
                                    Nothing yet.
                                </p>
                            ) : (
                                runs.map((run) => {
                                    const [label, tone] = runStatus[run.status];
                                    return (
                                        <Link
                                            key={run.id}
                                            href={showRun(run.id).url}
                                            className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0"
                                        >
                                            <span className="truncate text-[13px]">
                                                {run.label}
                                            </span>
                                            <StatusPill tone={tone}>
                                                {label}
                                            </StatusPill>
                                        </Link>
                                    );
                                })
                            )}
                        </Card>
                        <Card>
                            <Link
                                href={destroy(project.id).url}
                                method="delete"
                                as="button"
                                className={buttonClass('ghost', 'sm')}
                            >
                                Remove from LaraKube Desktop
                            </Link>
                            <p className="mt-1 text-xs text-soft">
                                Only forgets the project here. Your files and
                                servers stay.
                            </p>
                        </Card>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}

function Step({
    number,
    title,
    done,
    last = false,
    children,
}: {
    number: number;
    title: string;
    done: boolean;
    last?: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={
                last
                    ? 'flex gap-3.5 pt-3'
                    : 'flex gap-3.5 border-b border-line py-3'
            }
        >
            <span
                className={
                    done
                        ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-ok text-xs font-semibold text-white'
                        : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-badge text-xs font-semibold text-soft'
                }
            >
                {done ? '✓' : number}
            </span>
            <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-sm font-medium">{title}</p>
                {children}
            </div>
        </div>
    );
}

function InitForm({
    project,
    frameworks,
}: {
    project: Project;
    frameworks: Record<string, string>;
}) {
    const [framework, setFramework] = useState(
        project.detectedFramework ?? 'laravel',
    );

    return (
        <Form action={init(project.id)} className="flex items-center gap-2.5">
            {({ processing }) => (
                <>
                    <select
                        name="framework"
                        value={framework}
                        onChange={(event) => setFramework(event.target.value)}
                        className="rounded-lg border-0 bg-surface px-3 py-1.5 text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                    >
                        {Object.entries(frameworks).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                                {value === project.detectedFramework
                                    ? ' (detected)'
                                    : ''}
                            </option>
                        ))}
                    </select>
                    <Button type="submit" size="sm" disabled={processing}>
                        {processing ? 'Starting…' : 'Set up'}
                    </Button>
                </>
            )}
        </Form>
    );
}

function HostForm({
    project,
    serverIp,
    disabled,
}: {
    project: Project;
    serverIp: string | null;
    disabled: boolean;
}) {
    const [value, setValue] = useState(project.webHost ?? '');

    return (
        <Form action={setHost(project.id)} className="space-y-1.5">
            {({ errors, processing }) => (
                <>
                    <div className="flex items-center gap-2.5">
                        <input
                            name="host"
                            value={value}
                            onChange={(event) =>
                                setValue(
                                    event.target.value.trim().toLowerCase(),
                                )
                            }
                            placeholder="app.example.com"
                            disabled={disabled}
                            spellCheck={false}
                            className="w-72 rounded-lg border-0 px-3 py-1.5 font-mono text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers disabled:opacity-45"
                        />
                        <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            disabled={
                                disabled ||
                                processing ||
                                value === '' ||
                                value === project.webHost
                            }
                        >
                            {processing ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                    <p
                        className={
                            errors.host
                                ? 'text-xs text-accent'
                                : 'text-xs text-soft'
                        }
                    >
                        {errors.host ??
                            `Point this name's DNS at ${serverIp ?? 'your server'} (or connect a domain on the server page).`}
                    </p>
                </>
            )}
        </Form>
    );
}
