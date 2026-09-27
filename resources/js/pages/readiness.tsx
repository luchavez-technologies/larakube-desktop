import { Deferred, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { create as createServer } from '@/routes/servers';
import { install } from '@/routes/tools';
import type { Provider, Tool } from '@/types/larakube';

type Props = {
    tools?: Tool[];
    providers?: Provider[] | null;
    cliInstallCommand: string;
};

export default function Readiness({
    tools,
    providers,
    cliInstallCommand,
}: Props) {
    const cliMissing =
        tools?.find((tool) => tool.slug === 'larakube')?.installed === false;

    return (
        <AppLayout title="Setup">
            <p className="mb-8 max-w-2xl text-sm text-slate-600">
                LaraKube Desktop drives the LaraKube CLI on this machine.
                Everything marked required must be installed before you can
                create a server.
            </p>

            <Section title="Command-line tools">
                <Deferred data="tools" fallback={<SkeletonRows count={6} />}>
                    <>
                        {cliMissing && (
                            <CliMissing command={cliInstallCommand} />
                        )}
                        <ul className="divide-y divide-slate-100">
                            {tools?.map((tool) => (
                                <ToolRow
                                    key={tool.slug}
                                    tool={tool}
                                    cliMissing={cliMissing}
                                />
                            ))}
                        </ul>
                    </>
                </Deferred>
            </Section>

            <Section title="Cloud accounts">
                <Deferred
                    data="providers"
                    fallback={<SkeletonRows count={4} />}
                >
                    {providers ? (
                        <ul className="divide-y divide-slate-100">
                            {providers.map((provider) => (
                                <li
                                    key={provider.slug}
                                    className="flex items-center justify-between gap-4 py-3"
                                >
                                    <div>
                                        <div className="text-sm font-medium">
                                            {provider.label}
                                        </div>
                                        {provider.credentials.hint && (
                                            <div className="text-xs text-slate-500">
                                                {provider.credentials.hint}
                                            </div>
                                        )}
                                    </div>
                                    <StatusPill
                                        tone={
                                            provider.credentials.ready
                                                ? 'ok'
                                                : 'muted'
                                        }
                                    >
                                        {provider.credentials.ready
                                            ? 'Ready'
                                            : 'Not connected'}
                                    </StatusPill>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="py-3 text-sm text-slate-600">
                            Couldn't read cloud providers from the LaraKube CLI.
                            Install it, or update it to a version that has{' '}
                            <code className="rounded bg-slate-100 px-1">
                                cloud:providers
                            </code>
                            .
                        </p>
                    )}
                </Deferred>
            </Section>

            <div className="flex items-center gap-3">
                <Link
                    href={createServer().url}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
                >
                    Create a server
                </Link>
                <button
                    type="button"
                    onClick={() =>
                        router.reload({ only: ['tools', 'providers'] })
                    }
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                >
                    Check again
                </button>
            </div>
        </AppLayout>
    );
}

function ToolRow({ tool, cliMissing }: { tool: Tool; cliMissing: boolean }) {
    return (
        <li className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                    {tool.label}
                    {!tool.required && (
                        <span className="text-xs font-normal text-slate-400">
                            optional
                        </span>
                    )}
                </div>
                <div className="truncate text-xs text-slate-500">
                    {tool.installed
                        ? (tool.version ?? tool.path)
                        : tool.purpose}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {!tool.installed && tool.installable && !cliMissing && (
                    <Link
                        href={install(tool.slug).url}
                        method="post"
                        as="button"
                        className="rounded-md px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50"
                    >
                        Install
                    </Link>
                )}
                <StatusPill
                    tone={
                        tool.installed ? 'ok' : tool.required ? 'bad' : 'muted'
                    }
                >
                    {tool.installed ? 'Installed' : 'Missing'}
                </StatusPill>
            </div>
        </li>
    );
}

function CliMissing({ command }: { command: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <div className="mb-4 rounded-xl bg-setup-50 p-4 text-sm">
            <p className="mb-2 font-medium text-slate-900">
                Install the LaraKube CLI first
            </p>
            <p className="mb-3 text-slate-600">
                Open Terminal, paste this command, and enter your Mac password
                when asked. Then click “Check again”.
            </p>
            <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs ring-1 ring-slate-200">
                    {command}
                </code>
                <button
                    type="button"
                    onClick={() => {
                        void navigator.clipboard.writeText(command);
                        setCopied(true);
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mb-6 max-w-3xl rounded-2xl bg-white px-6 py-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {title}
            </h2>
            {children}
        </section>
    );
}

function SkeletonRows({ count }: { count: number }) {
    return (
        <ul className="divide-y divide-slate-100">
            {Array.from({ length: count }, (_, index) => (
                <li
                    key={index}
                    className="flex items-center justify-between py-3"
                >
                    <div className="space-y-1.5">
                        <div className="h-3.5 w-32 animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
                    </div>
                    <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
                </li>
            ))}
        </ul>
    );
}
