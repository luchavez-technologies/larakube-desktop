import { Deferred, Link, router } from '@inertiajs/react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { create as createServer } from '@/routes/servers';
import { install } from '@/routes/setup/tools';
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
            <PageHeader
                title="Setup"
                subtitle="Everything LaraKube Desktop needs on this Mac. Required tools must be installed before you can create a server."
                actions={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() =>
                                router.reload({ only: ['tools', 'providers'] })
                            }
                        >
                            Check again
                        </Button>
                        {!cliMissing && (
                            <Link
                                href={createServer().url}
                                className={buttonClass('primary')}
                            >
                                Create a server
                            </Link>
                        )}
                    </>
                }
            />

            <Deferred data="tools" fallback={<Skeleton />}>
                {cliMissing ? (
                    <CliMissing command={cliInstallCommand} />
                ) : (
                    <div className="grid grid-cols-2 items-start gap-4.5">
                        <Card label="Command-line tools">
                            {tools?.map((tool) => (
                                <ListRow
                                    key={tool.slug}
                                    action={<ToolState tool={tool} />}
                                >
                                    <TwoLine
                                        title={
                                            tool.required
                                                ? tool.label
                                                : `${tool.label} · optional`
                                        }
                                        detail={
                                            tool.installed
                                                ? (tool.version ?? tool.path)
                                                : tool.purpose
                                        }
                                        mono={tool.installed}
                                    />
                                </ListRow>
                            ))}
                        </Card>
                        <Card label="Cloud accounts">
                            <Deferred
                                data="providers"
                                fallback={
                                    <p className="py-3 text-sm text-soft">
                                        Checking logins…
                                    </p>
                                }
                            >
                                {providers ? (
                                    <>
                                        {providers.map((provider) => (
                                            <ListRow
                                                key={provider.slug}
                                                action={
                                                    <StatusPill
                                                        tone={
                                                            provider.credentials
                                                                .ready
                                                                ? 'ok'
                                                                : 'muted'
                                                        }
                                                    >
                                                        {provider.credentials
                                                            .ready
                                                            ? 'Ready'
                                                            : 'Not connected'}
                                                    </StatusPill>
                                                }
                                            >
                                                <TwoLine
                                                    title={provider.label}
                                                    detail={
                                                        provider.credentials
                                                            .hint ??
                                                        'Credentials found'
                                                    }
                                                />
                                            </ListRow>
                                        ))}
                                        <p className="mt-2 text-xs leading-relaxed text-soft">
                                            Logins happen in each provider's own
                                            CLI for now. Connecting accounts
                                            from here is next.
                                        </p>
                                    </>
                                ) : (
                                    <p className="py-3 text-sm text-soft">
                                        Couldn't read cloud providers. Update
                                        the LaraKube CLI to a version with
                                        cloud:providers.
                                    </p>
                                )}
                            </Deferred>
                        </Card>
                    </div>
                )}
            </Deferred>
        </AppLayout>
    );
}

function ToolState({ tool }: { tool: Tool }) {
    if (tool.installed) {
        return <StatusPill tone="ok">Installed</StatusPill>;
    }

    return (
        <>
            {tool.installable && (
                <Link
                    href={install(tool.slug).url}
                    method="post"
                    as="button"
                    className={buttonClass('secondary', 'sm')}
                >
                    Install
                </Link>
            )}
            <StatusPill tone={tool.required ? 'bad' : 'muted'}>
                Missing
            </StatusPill>
        </>
    );
}

function CliMissing({ command }: { command: string }) {
    return (
        <Card tone="error" className="p-6.5">
            <h2 className="text-lg font-semibold tracking-[-0.015em]">
                Install the LaraKube CLI
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                LaraKube Desktop runs everything through the LaraKube CLI. Open
                Terminal, run this command, enter your Mac password when asked,
                then click Check again.
            </p>
            <div className="mt-4 flex max-w-2xl items-center justify-between gap-3 rounded-[10px] bg-surface px-3 py-2.5 ring-1 ring-line">
                <code className="truncate font-mono text-xs">$ {command}</code>
                <CopyButton value={command} />
            </div>
        </Card>
    );
}

function Skeleton() {
    return (
        <div className="grid grid-cols-2 gap-4.5">
            {[0, 1].map((column) => (
                <div
                    key={column}
                    className="space-y-3 rounded-2xl bg-surface p-5.5 ring-1 ring-line"
                >
                    {Array.from({ length: 4 }, (_, row) => (
                        <div
                            key={row}
                            className="h-9 animate-pulse rounded bg-badge"
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
