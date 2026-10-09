import { useState } from 'react';
import { Deferred, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    Key,
    RefreshCw,
    X,
    AlertCircle,
    Plus,
    RotateCw,
    XCircle,
    Users,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import CloudAccountsModal from '@/components/cloud-accounts-modal';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import { ListRow, TwoLine } from '@/components/list-row';
import SelectMenu from '@/components/select-menu';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { create as createServer } from '@/routes/servers';
import CliMissing from '@/components/setup/cli-missing';
import UsageChoice from '@/components/setup/usage-choice';
import ToolCatalogList, {
    type CatalogEntry,
} from '@/components/setup/tool-catalog';
import WslCheck, { type WslState } from '@/components/setup/wsl-check';
import { useToolStatus } from '@/lib/tool-status';
import type { Provider } from '@/types/larakube';

type Props = {
    windows: boolean;
    wsl?: WslState | null;
    catalog: CatalogEntry[];
    providers?: Provider[] | null;
    cliInstallCommand: string;
    cliChannel?: string;
    cliDownloadUrl?: string;
    usage: 'tools' | 'apps' | null;
    terminalConfigured?: boolean;
    shellProfile?: string;
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
    terminalConfigured = false,
    shellProfile = '.zshrc',
    localCluster,
}: Props) {
    const [refresh, setRefresh] = useState(0);
    const cli = useToolStatus('larakube', refresh);
    const cliMissing = cli.status?.installed === false;

    const [selectedChannel, setSelectedChannel] = useState(cliChannel);
    const [showAwsModal, setShowAwsModal] = useState(false);
    const [accountModalProvider, setAccountModalProvider] =
        useState<Provider | null>(null);

    return (
        <AppLayout title="Setup">
            <PageHeader
                title="Setup"
                subtitle="Everything LaraKube Desktop needs on this computer. Required tools must be installed before you can create a server."
                actions={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setRefresh((count) => count + 1);
                                router.reload({ only: ['providers', 'wsl'] });
                            }}
                        >
                            <RotateCw className="size-4" />
                            <span>Check again</span>
                        </Button>
                        {!cliMissing && (
                            <Link
                                href={createServer().url}
                                className={buttonClass('primary')}
                            >
                                <Plus className="size-4" />
                                <span>Create a server</span>
                            </Link>
                        )}
                    </>
                }
            />

            {windows && (!wsl || wsl.state !== 'ready') ? (
                <WslCheck wsl={wsl} />
            ) : cliMissing ? (
                <CliMissing
                    windows={windows}
                    diagnostic={cli.status?.diagnostic ?? null}
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
                        <>
                            <LocalDevelopment cluster={localCluster} />
                            {!windows && (
                                <TerminalIntegrationCard
                                    configured={terminalConfigured}
                                    profile={shellProfile}
                                />
                            )}
                        </>
                    )}
                    <div className="grid grid-cols-2 items-start gap-4.5">
                        <Card label="Command-line tools">
                            <ToolCatalogList
                                catalog={catalog}
                                channel={selectedChannel}
                                refresh={refresh}
                                showLocalOnly={usage === 'apps'}
                            />
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
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() =>
                                                                setAccountModalProvider(
                                                                    provider,
                                                                )
                                                            }
                                                            className="w-33 justify-center gap-1.5"
                                                        >
                                                            <Users className="size-3.5" />
                                                            <span>
                                                                {provider
                                                                    .credentials
                                                                    .ready
                                                                    ? 'Accounts / Keys'
                                                                    : 'Connect'}
                                                            </span>
                                                        </Button>
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
                                                                ? provider.accounts &&
                                                                  provider
                                                                      .accounts
                                                                      .length >
                                                                      1
                                                                    ? `Ready (${provider.accounts.length})`
                                                                    : 'Ready'
                                                                : 'Not connected'}
                                                        </StatusPill>
                                                    </div>
                                                }
                                            >
                                                <TwoLine
                                                    title={provider.label}
                                                    detail={
                                                        provider.activeAccount
                                                            ? `Active account: ${provider.activeAccount}`
                                                            : (provider
                                                                  .credentials
                                                                  .hint ??
                                                              'Credentials verified')
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

            {/* Cloud Multi-Account Modal */}
            {accountModalProvider && (
                <CloudAccountsModal
                    provider={accountModalProvider}
                    onClose={() => setAccountModalProvider(null)}
                />
            )}

            {/* AWS Credential Modal */}
            {showAwsModal && (
                <AwsCredentialsModal
                    onClose={() => setShowAwsModal(false)}
                    isConfigured={Boolean(
                        providers?.find((p) => p.slug === 'aws')?.credentials
                            .ready,
                    )}
                />
            )}
        </AppLayout>
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

function TerminalIntegrationCard({
    configured,
    profile,
}: {
    configured: boolean;
    profile: string;
}) {
    const [installing, setInstalling] = useState(false);

    const handleInstall = () => {
        setInstalling(true);
        router.post(
            '/setup/terminal/install',
            {},
            {
                preserveScroll: true,
                onFinish: () => setInstalling(false),
            },
        );
    };

    return (
        <div className="mb-4.5">
            <Card label="Terminal integration">
                <ListRow
                    action={
                        configured ? (
                            <StatusPill tone="ok">
                                {`Added to ${profile}`}
                            </StatusPill>
                        ) : (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={installing}
                                onClick={handleInstall}
                            >
                                {installing ? 'Adding…' : `Add to ${profile}`}
                            </Button>
                        )
                    }
                >
                    <TwoLine
                        title="Use CLI tools in Terminal"
                        detail={
                            configured
                                ? `~/.larakube/bin is in your PATH. You can run larakube, kubectl, and tofu directly in your terminal.`
                                : `Add ~/.larakube/bin to your ${profile} so you can run larakube, kubectl, and tofu from any shell window.`
                        }
                    />
                </ListRow>
            </Card>
        </div>
    );
}

function AwsCredentialsModal({
    onClose,
    isConfigured = false,
}: {
    onClose: () => void;
    isConfigured?: boolean;
}) {
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
                        {isConfigured
                            ? 'Update AWS Credentials'
                            : 'Connect AWS Account'}
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

                    <AwsPolicyHelper />

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
                        <SelectMenu
                            value={form.data.region}
                            onChange={(value) => form.setData('region', value)}
                            options={regions}
                        />
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
                            className="gap-1.5"
                        >
                            <XCircle className="size-3.5" />
                            <span>Cancel</span>
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={form.processing}
                            className="gap-1.5"
                        >
                            {form.processing ? (
                                <RefreshCw className="size-3.5 animate-spin" />
                            ) : (
                                <Key className="size-3.5" />
                            )}
                            <span>
                                {form.processing
                                    ? 'Verifying…'
                                    : isConfigured
                                      ? 'Update & Verify'
                                      : 'Save & Verify'}
                            </span>
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
