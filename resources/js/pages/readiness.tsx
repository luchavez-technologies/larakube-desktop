import { useState } from 'react';
import { Deferred, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    Download,
    ExternalLink,
    Key,
    RefreshCw,
    X,
    AlertCircle,
    Check,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import { ListRow, TwoLine } from '@/components/list-row';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { create as createServer } from '@/routes/servers';
import { install } from '@/routes/setup/tools';
import { useToolStatus } from '@/lib/tool-status';
import type { Provider, Tool } from '@/types/larakube';

type CatalogEntry = Omit<Tool, 'installed' | 'path' | 'version'>;

type WslState = {
    state: 'ready' | 'missing' | 'no-distro' | 'old-version' | 'broken';
    distro: string | null;
    version: number | null;
    message: string;
    command: string | null;
};

type Props = {
    windows: boolean;
    wsl?: WslState | null;
    catalog: CatalogEntry[];
    providers?: Provider[] | null;
    cliInstallCommand: string;
    cliChannel?: string;
    cliDownloadUrl?: string;
    usage: 'tools' | 'apps' | null;
    localCluster?: {
        engine: string;
        context: string | null;
        status: string;
        tone: string;
    };
};

export default function Readiness({
    windows,
    wsl,
    catalog,
    providers,
    cliInstallCommand,
    cliChannel = 'canary',
    cliDownloadUrl: _cliDownloadUrl,
    usage,
    localCluster,
}: Props) {
    const [refresh, setRefresh] = useState(0);
    const cli = useToolStatus('larakube', refresh);
    const cliMissing = cli.status?.installed === false;

    const [selectedChannel, setSelectedChannel] = useState(cliChannel);
    const [showAwsModal, setShowAwsModal] = useState(false);
    const [isGcpLoggingIn, setIsGcpLoggingIn] = useState(false);

    return (
        <AppLayout title="Setup">
            <PageHeader
                title="Setup"
                subtitle="Everything LaraKube Desktop needs on this Mac. Required tools must be installed before you can create a server."
                actions={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setRefresh((count) => count + 1);
                                router.reload({ only: ['providers', 'wsl'] });
                            }}
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

            {windows && (!wsl || wsl.state !== 'ready') ? (
                <WslCheck wsl={wsl} />
            ) : cliMissing ? (
                <CliMissing
                    command={cliInstallCommand}
                    channel={selectedChannel}
                    onChannelChange={(ch) => {
                        setSelectedChannel(ch);
                        router.post(
                            '/setup/cli/channel',
                            { channel: ch },
                            { preserveState: true },
                        );
                    }}
                />
            ) : (
                <>
                    <UsageChoice usage={usage} />
                    {usage === 'apps' && (
                        <LocalDevelopment cluster={localCluster} />
                    )}
                    <div className="grid grid-cols-2 items-start gap-4.5">
                        <Card label="Command-line tools">
                            {catalog
                                .filter(
                                    (entry) =>
                                        usage === 'apps' || !entry.localOnly,
                                )
                                .map((entry) => (
                                    <ToolRow
                                        key={entry.slug}
                                        entry={entry}
                                        channel={selectedChannel}
                                        refresh={refresh}
                                    />
                                ))}
                        </Card>
                        <Card label="Cloud accounts">
                            <Deferred
                                data="providers"
                                fallback={
                                    <p className="flex items-center gap-2 py-3 text-sm text-soft">
                                        <RefreshCw className="size-4 animate-spin" />
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
                                                    <div className="flex items-center gap-2">
                                                        {!provider.credentials
                                                            .ready &&
                                                            provider.slug ===
                                                                'aws' && (
                                                                <Button
                                                                    type="button"
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        setShowAwsModal(
                                                                            true,
                                                                        )
                                                                    }
                                                                    className="gap-1.5"
                                                                >
                                                                    <Key className="size-3.5" />
                                                                    <span>
                                                                        Connect
                                                                    </span>
                                                                </Button>
                                                            )}
                                                        {!provider.credentials
                                                            .ready &&
                                                            provider.slug ===
                                                                'gcp' && (
                                                                <Button
                                                                    type="button"
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setIsGcpLoggingIn(
                                                                            true,
                                                                        );
                                                                        router.post(
                                                                            '/setup/cloud/gcp/login',
                                                                            {},
                                                                            {
                                                                                onFinish:
                                                                                    () =>
                                                                                        setIsGcpLoggingIn(
                                                                                            false,
                                                                                        ),
                                                                            },
                                                                        );
                                                                    }}
                                                                    disabled={
                                                                        isGcpLoggingIn
                                                                    }
                                                                    className="gap-1.5"
                                                                >
                                                                    {isGcpLoggingIn ? (
                                                                        <RefreshCw className="size-3.5 animate-spin" />
                                                                    ) : (
                                                                        <ExternalLink className="size-3.5" />
                                                                    )}
                                                                    <span>
                                                                        Sign in
                                                                    </span>
                                                                </Button>
                                                            )}
                                                        <StatusPill
                                                            tone={
                                                                provider
                                                                    .credentials
                                                                    .ready
                                                                    ? 'ok'
                                                                    : 'muted'
                                                            }
                                                        >
                                                            {provider
                                                                .credentials
                                                                .ready
                                                                ? 'Ready'
                                                                : 'Not connected'}
                                                        </StatusPill>
                                                    </div>
                                                }
                                            >
                                                <TwoLine
                                                    title={provider.label}
                                                    detail={
                                                        provider.credentials
                                                            .hint ??
                                                        'Credentials verified'
                                                    }
                                                />
                                            </ListRow>
                                        ))}
                                        <p className="mt-2 text-xs leading-relaxed text-soft">
                                            AWS & Google Cloud connect natively
                                            without terminal. Tokens for
                                            DigitalOcean & Hetzner can also be
                                            pre-configured in Settings.
                                        </p>
                                    </>
                                ) : (
                                    <p className="py-3 text-sm text-soft">
                                        Couldn't read cloud providers. Update
                                        the LaraKube CLI.
                                    </p>
                                )}
                            </Deferred>
                        </Card>
                    </div>
                </>
            )}

            {/* AWS Credential Modal */}
            {showAwsModal && (
                <AwsCredentialsModal onClose={() => setShowAwsModal(false)} />
            )}
        </AppLayout>
    );
}

const USAGES: { value: 'tools' | 'apps'; title: string; detail: string }[] = [
    {
        value: 'tools',
        title: 'Install tools on a server',
        detail: 'Create servers and set up chat, a wiki, sign-in and more for your team. Nothing runs on this computer.',
    },
    {
        value: 'apps',
        title: 'Build and run apps here',
        detail: 'Everything above, plus creating apps and running them on this computer to work on them.',
    },
];

function UsageChoice({ usage }: { usage: 'tools' | 'apps' | null }) {
    return (
        <div className="mb-4.5">
            <p className="mb-2 text-sm font-medium">
                What will you use LaraKube Desktop for?
                {usage === null && (
                    <span className="ml-2 font-normal text-accent">
                        Choose one
                    </span>
                )}
            </p>
            <div
                role="radiogroup"
                aria-label="What this computer is for"
                className="grid grid-cols-2 gap-3"
            >
                {USAGES.map((option) => {
                    const selected = usage === option.value;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() =>
                                router.post(
                                    '/setup/usage',
                                    { usage: option.value },
                                    { preserveScroll: true, only: ['usage'] },
                                )
                            }
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
                                selected
                                    ? 'border-accent bg-accent-tint'
                                    : 'border-line bg-white hover:border-faint hover:bg-paper'
                            }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                    selected
                                        ? 'border-accent bg-accent text-white'
                                        : 'border-faint bg-white'
                                }`}
                            >
                                {selected && <Check className="size-3" />}
                            </span>
                            <span>
                                <span className="block text-sm font-semibold">
                                    {option.title}
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-soft">
                                    {option.detail}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function LocalDevelopment({ cluster }: { cluster?: Props['localCluster'] }) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const running = cluster?.tone === 'ok';

    const start = () => {
        if (
            window.confirm(
                'This installs a local Kubernetes cluster (k3s) so you can run apps on this computer. It needs administrator access for a few minutes: LaraKube Desktop allows it only while the setup runs, then removes it. Continue?',
            )
        ) {
            router.post('/setup/local');
        }
    };

    return (
        <div className="mb-4.5">
            <Card label="Local development">
                <ListRow
                    action={
                        running ? (
                            <StatusPill tone="ok">Ready</StatusPill>
                        ) : (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={start}
                            >
                                Set up local development
                            </Button>
                        )
                    }
                >
                    <TwoLine
                        title="Local cluster"
                        detail={
                            running
                                ? `${cluster?.engine} is running`
                                : 'Runs your apps on this computer so you can work on them.'
                        }
                    />
                </ListRow>
                {errors.local && (
                    <p className="mt-2 text-xs text-accent">{errors.local}</p>
                )}
            </Card>
        </div>
    );
}

function WslCheck({ wsl }: { wsl?: WslState | null }) {
    if (!wsl) {
        return (
            <Card label="Windows Subsystem for Linux">
                <p className="flex items-center gap-2 py-3 text-sm text-soft">
                    <RefreshCw className="size-4 animate-spin" />
                    Checking Windows Subsystem for Linux…
                </p>
            </Card>
        );
    }

    return (
        <Card label="Windows Subsystem for Linux">
            <div className="flex items-start gap-3 py-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-accent" />
                <div className="space-y-3 text-sm">
                    <p className="font-medium">{wsl.message}</p>
                    {wsl.command ? (
                        <>
                            <ol className="list-decimal space-y-1 pl-5 text-soft">
                                <li>
                                    Open PowerShell as administrator
                                    (right-click Start, then Terminal (Admin)).
                                </li>
                                <li>Run this command:</li>
                            </ol>
                            <div className="flex items-center justify-between gap-3 rounded-lg bg-term px-3 py-2 font-mono text-xs text-term-bright">
                                <code>{wsl.command}</code>
                                <CopyButton value={wsl.command} />
                            </div>
                            <p className="text-soft">
                                Restart your computer if Windows asks, open
                                LaraKube Desktop again, then press Check again.
                            </p>
                        </>
                    ) : (
                        <p className="text-soft">
                            Restart your computer, and make sure virtualization
                            is turned on in the BIOS. Then open LaraKube Desktop
                            and press Check again.
                        </p>
                    )}
                </div>
            </div>
        </Card>
    );
}

function ToolRow({
    entry,
    channel,
    refresh,
}: {
    entry: CatalogEntry;
    channel: string;
    refresh: number;
}) {
    const { status, checking } = useToolStatus(entry.slug, refresh);
    const tool = status ? { ...entry, ...status } : null;

    return (
        <ListRow
            action={
                tool && !checking ? (
                    <ToolState tool={tool} channel={channel} />
                ) : (
                    <RefreshCw className="size-4 animate-spin text-faint" />
                )
            }
        >
            <TwoLine
                title={
                    entry.required ? entry.label : `${entry.label} · optional`
                }
                detail={
                    tool?.installed
                        ? (tool.version ?? tool.path)
                        : entry.purpose
                }
                mono={tool?.installed}
            />
        </ListRow>
    );
}

function ToolState({ tool, channel }: { tool: Tool; channel: string }) {
    if (tool.installed) {
        return <StatusPill tone="ok">Installed</StatusPill>;
    }

    return (
        <div className="flex items-center gap-2">
            {tool.installable && (
                <Link
                    href={install(tool.slug).url}
                    data={{ channel }}
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
        </div>
    );
}

function CliMissing({
    command,
    channel,
    onChannelChange,
}: {
    command: string;
    channel: string;
    onChannelChange: (channel: string) => void;
}) {
    const [installing, setInstalling] = useState(false);

    const handleInstall = () => {
        setInstalling(true);
        router.post(
            '/setup/tools/larakube/install',
            { channel },
            {
                onFinish: () => setInstalling(false),
            },
        );
    };

    return (
        <Card tone="error" className="p-6.5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-[-0.015em]">
                        Install the LaraKube CLI
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                        LaraKube Desktop runs everything through the LaraKube
                        CLI. Install it in one click without touching the
                        terminal, or run the command below.
                    </p>
                </div>

                {/* Release Channel Selector */}
                <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-line">
                    <span className="text-xs font-medium text-soft">
                        Channel:
                    </span>
                    <button
                        type="button"
                        onClick={() => onChannelChange('canary')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            channel === 'canary'
                                ? 'bg-brand text-white shadow-2xs'
                                : 'hover:text-foreground text-soft'
                        }`}
                    >
                        Canary
                    </button>
                    <button
                        type="button"
                        onClick={() => onChannelChange('stable')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            channel === 'stable'
                                ? 'bg-brand text-white shadow-2xs'
                                : 'hover:text-foreground text-soft'
                        }`}
                    >
                        Stable
                    </button>
                </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
                <Button
                    type="button"
                    variant="primary"
                    onClick={handleInstall}
                    disabled={installing}
                    className="gap-2 px-5 py-2.5 text-sm"
                >
                    {installing ? (
                        <RefreshCw className="size-4 animate-spin" />
                    ) : (
                        <Download className="size-4" />
                    )}
                    <span>
                        {installing
                            ? 'Downloading and installing…'
                            : `Install LaraKube CLI (${channel === 'canary' ? 'Canary' : 'Stable'})`}
                    </span>
                </Button>
            </div>

            <div className="mt-6 border-t border-line/60 pt-4">
                <p className="mb-2 text-xs text-soft">
                    Or install manually via Terminal:
                </p>
                <div className="flex max-w-2xl items-center justify-between gap-3 rounded-[10px] bg-surface px-3 py-2.5 ring-1 ring-line">
                    <code className="truncate font-mono text-xs">
                        $ {command}
                    </code>
                    <CopyButton value={command} />
                </div>
            </div>
        </Card>
    );
}

function AwsCredentialsModal({ onClose }: { onClose: () => void }) {
    const form = useForm({
        access_key_id: '',
        secret_access_key: '',
        region: 'us-east-1',
        aws: '',
    });

    const regions = [
        { value: 'us-east-1', label: 'US East (N. Virginia) · us-east-1' },
        { value: 'us-west-2', label: 'US West (Oregon) · us-west-2' },
        { value: 'eu-west-1', label: 'EU (Ireland) · eu-west-1' },
        { value: 'eu-central-1', label: 'EU (Frankfurt) · eu-central-1' },
        {
            value: 'ap-southeast-1',
            label: 'Asia Pacific (Singapore) · ap-southeast-1',
        },
        {
            value: 'ap-northeast-1',
            label: 'Asia Pacific (Tokyo) · ap-northeast-1',
        },
    ];

    function submit(e: React.FormEvent) {
        e.preventDefault();
        form.post('/setup/cloud/aws', {
            onSuccess: () => {
                onClose();
                router.reload({ only: ['providers'] });
            },
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-line">
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <h3 className="text-base font-semibold">
                        Connect AWS Account
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="hover:text-foreground rounded-lg p-1.5 text-soft transition hover:bg-badge"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <form onSubmit={submit} className="mt-4 space-y-4">
                    <p className="text-xs leading-relaxed text-soft">
                        Credentials will be saved securely to{' '}
                        <code className="text-foreground">
                            ~/.aws/credentials
                        </code>{' '}
                        and tested via AWS STS.
                    </p>

                    <div>
                        <label className="text-foreground mb-1 block text-xs font-medium">
                            AWS Access Key ID
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            value={form.data.access_key_id}
                            onChange={(e) =>
                                form.setData('access_key_id', e.target.value)
                            }
                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                        />
                        {form.errors.access_key_id && (
                            <p className="mt-1 text-xs text-accent">
                                {form.errors.access_key_id}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-foreground mb-1 block text-xs font-medium">
                            AWS Secret Access Key
                        </label>
                        <input
                            type="password"
                            required
                            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                            value={form.data.secret_access_key}
                            onChange={(e) =>
                                form.setData(
                                    'secret_access_key',
                                    e.target.value,
                                )
                            }
                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                        />
                        {form.errors.secret_access_key && (
                            <p className="mt-1 text-xs text-accent">
                                {form.errors.secret_access_key}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-foreground mb-1 block text-xs font-medium">
                            Default Region
                        </label>
                        <select
                            value={form.data.region}
                            onChange={(e) =>
                                form.setData('region', e.target.value)
                            }
                            className="w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                        >
                            {regions.map((r) => (
                                <option key={r.value} value={r.value}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                        {form.errors.region && (
                            <p className="mt-1 text-xs text-accent">
                                {form.errors.region}
                            </p>
                        )}
                    </div>

                    {form.errors.aws && (
                        <div className="bg-bad-tint flex items-start gap-2 rounded-lg p-3 text-xs text-accent">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <span>{form.errors.aws}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2.5 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={form.processing}
                        >
                            {form.processing ? 'Verifying…' : 'Save & Verify'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
