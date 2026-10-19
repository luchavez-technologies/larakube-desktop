import { Link, useForm, usePage } from '@inertiajs/react';
import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Cloud,
    ExternalLink,
    Eye,
    EyeOff,
    FolderOpen,
    Globe,
    Key,
    Layers,
    Lock,
    Plus,
    RotateCw,
    Server,
    ShieldCheck,
    Users,
    X,
} from 'lucide-react';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import DnsTlsFields, { type DnsTlsProvider } from '@/components/dns-tls-fields';
import Button, { buttonClass } from '@/components/button';
import CloudAccountsModal from '@/components/cloud-accounts-modal';
import GcpSignIn from '@/components/gcp-sign-in';
import InfoTooltip from '@/components/info-tooltip';
import PageHeader from '@/components/page-header';
import ProviderLogo from '@/components/provider-logo';
import SelectMenu from '@/components/select-menu';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { readiness } from '@/routes';
import { sendJson } from '@/lib/http';
import { openExternalUrl } from '@/lib/open-external';
import {
    index as devBoxesIndex,
    store as storeDevBox,
} from '@/routes/devboxes';
import { index, store } from '@/routes/servers';
import type { Provider, Untested } from '@/types/larakube';

const tokenProviders = ['do', 'hetzner'];

const existingProvider: Provider = {
    slug: 'existing',
    label: 'Existing VPS / Custom Server',
    regions: [],
    defaultRegion: '',
    vpsSizes: [],
    defaultVpsSize: '',
    credentials: { ready: true, hint: null },
};

export default function CreateServer({
    providers,
    project,
    kind = 'server',
    defaultProvider,
    detectedKeys = [],
}: {
    providers?: Provider[] | null;
    project: { id: number; name: string } | null;
    kind?: 'server' | 'dev-box';
    defaultProvider?: string;
    detectedKeys?: Array<{
        path: string;
        label: string;
        encrypted: boolean;
        in_agent: boolean;
    }>;
}) {
    const devBox = kind === 'dev-box';

    return (
        <AppLayout title={devBox ? 'Create a dev box' : 'Create a server'}>
            <PageHeader
                title={devBox ? 'Create a dev box' : 'Create a server'}
                subtitle={
                    devBox
                        ? 'A server to work on, with Podman, a local cluster and the LaraKube CLI set up. Takes about 10 minutes and is billed by your provider.'
                        : 'A single-node Kubernetes server (k3s), hardened and ready for Cluster Tools. Takes about 5 minutes and is billed by your provider.'
                }
            />
            {project && (
                <p className="mb-5 max-w-3xl rounded-lg bg-busy-tint px-3 py-2 text-sm text-busy">
                    For project {project.name}: its production environment will
                    be linked to this new server.
                </p>
            )}
            {providers && providers.length > 0 ? (
                <ServerForm
                    providers={providers}
                    projectId={project?.id ?? null}
                    devBox={devBox}
                    defaultProvider={defaultProvider}
                    detectedKeys={detectedKeys}
                />
            ) : (
                <p className="text-sm text-soft">
                    The LaraKube CLI isn't ready yet. Finish Setup first.
                </p>
            )}
        </AppLayout>
    );
}

function ServerForm({
    providers,
    projectId,
    devBox,
    defaultProvider,
    detectedKeys = [],
}: {
    providers: Provider[];
    projectId: number | null;
    devBox: boolean;
    defaultProvider?: string;
    detectedKeys?: Array<{
        path: string;
        label: string;
        encrypted: boolean;
        in_agent: boolean;
    }>;
}) {
    const { untested } = usePage<{ untested: Untested }>().props;
    const [providerList, setProviderList] = useState<Provider[]>(providers);
    const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
    const [refreshedProviders, setRefreshedProviders] = useState<Set<string>>(
        new Set(),
    );

    async function refreshCatalog(slug: string) {
        setIsRefreshingCatalog(true);
        try {
            const { ok, data } = await sendJson<Provider>(
                `/servers/provider-catalog/${slug}`,
                'GET',
            );
            if (ok && data) {
                setProviderList((prev) =>
                    prev.map((p) => (p.slug === slug ? data : p)),
                );
                setRefreshedProviders((prev) => new Set(prev).add(slug));
            }
        } catch (e) {
            console.error('Failed to refresh provider catalog', e);
        } finally {
            setIsRefreshingCatalog(false);
        }
    }

    const allProviders = devBox
        ? providerList
        : [...providerList, existingProvider];
    const startSize = (candidate: Provider, targetKind: 'vps' | 'managed') =>
        candidate.slug === 'existing'
            ? ''
            : targetKind === 'managed'
              ? (candidate.defaultManagedSize ?? candidate.defaultVpsSize)
              : devBox
                ? (candidate.defaultDevBoxSize ?? candidate.defaultVpsSize)
                : candidate.defaultVpsSize;
    const initial =
        allProviders.find(
            (provider) =>
                provider.slug === defaultProvider && provider.credentials.ready,
        ) ??
        allProviders.find((provider) => provider.credentials.ready) ??
        allProviders[0];
    const form = useForm('servers.create', {
        provider: initial.slug,
        stack_name: '',
        region: initial.defaultRegion,
        size: startSize(initial, 'vps'),
        target_kind: 'vps' as 'vps' | 'managed',
        node_count: '2',
        ha: false,
        k8s_version_prefix: '',
        api_token: '',
        cloudflare_token: '',
        dns_provider: '',
        enable_dns: true,
        enable_tls: true,
        dns_aws_access_key_id: '',
        dns_aws_secret_access_key: '',
        dns_aws_region: 'us-east-1',
        dns_gcp_project_id: '',
        dns_gcp_credentials: '',
        aws_access_key_id: '',
        aws_secret_access_key: '',
        project_id: projectId,
        account: initial.activeAccount ?? initial.accounts?.[0]?.id ?? '',
        ssh_port: 22,
        ip: '',
        ssh_user: 'root',
        ssh_key: detectedKeys[0]?.path ?? '',
        ssh_passphrase: '',
    });

    const [currentStep, setCurrentStep] = useState(1);
    const [highestReachedStep, setHighestReachedStep] = useState(1);
    const [overrideAwsKeys, setOverrideAwsKeys] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);

    const [inspectingKey, setInspectingKey] = useState(false);
    const [keyInfo, setKeyInfo] = useState<{
        valid?: boolean;
        encrypted?: boolean;
        in_agent?: boolean;
    }>({
        valid: detectedKeys.length > 0,
        encrypted: detectedKeys[0]?.encrypted ?? false,
        in_agent: detectedKeys[0]?.in_agent ?? false,
    });
    const [showPassphrase, setShowPassphrase] = useState(false);

    async function inspectKeyPath(path: string) {
        if (!path || path.trim() === '') {
            setKeyInfo({});
            return;
        }
        setInspectingKey(true);
        try {
            const { ok, data } = await sendJson<{
                valid: boolean;
                encrypted: boolean;
                in_agent: boolean;
            }>('/servers/inspect-key', 'POST', { path });
            if (ok) {
                setKeyInfo(data);
            }
        } catch (e) {
            console.error('Failed to inspect SSH key', e);
        } finally {
            setInspectingKey(false);
        }
    }

    async function handlePickKey() {
        try {
            const { ok, data } = await sendJson<{
                path: string | null;
                valid?: boolean;
                encrypted?: boolean;
                in_agent?: boolean;
            }>('/servers/pick-key', 'POST');
            if (ok && data.path) {
                form.setData('ssh_key', data.path);
                setKeyInfo({
                    valid: data.valid ?? true,
                    encrypted: data.encrypted ?? false,
                    in_agent: data.in_agent ?? false,
                });
            }
        } catch (e) {
            console.error('Failed to pick SSH key', e);
        }
    }

    const provider =
        allProviders.find(
            (candidate) => candidate.slug === form.data.provider,
        ) ?? initial;

    const isExisting = form.data.provider === 'existing';

    const needsToken =
        tokenProviders.includes(provider.slug) && !provider.credentials.ready;
    const needsAwsKeys =
        provider.slug === 'aws' &&
        (!provider.credentials.ready || overrideAwsKeys);
    const needsGcpLogin =
        provider.slug === 'gcp' && !provider.credentials.ready;
    const cliMissing =
        !isExisting && /not installed/i.test(provider.credentials.hint ?? '');

    const canBeManaged =
        !devBox && !isExisting && (provider.managedSizes?.length ?? 0) > 0;
    const isManaged = form.data.target_kind === 'managed' && canBeManaged;
    const sizeOptions =
        (isManaged ? provider.managedSizes : provider.vpsSizes) ?? [];
    const size = sizeOptions.find((option) => option.value === form.data.size);
    const price = size?.label.match(/\(([^)]*\/mo[^)]*)\)/)?.[1];
    const nodeCount = Math.max(1, parseInt(form.data.node_count, 10) || 1);
    const monthlyEstimate = isManaged
        ? estimateManagedCost(price, nodeCount, form.data.ha, provider.haCost)
        : undefined;

    const steps = devBox
        ? [
              { number: 1, title: 'Choose Provider', icon: Cloud },
              { number: 2, title: 'Customize Dev Box', icon: Server },
          ]
        : [
              { number: 1, title: 'Choose Provider', icon: Cloud },
              {
                  number: 2,
                  title: isExisting ? 'Server & SSH' : 'Customize Server',
                  icon: Server,
              },
              { number: 3, title: 'DNS & SSL Automation', icon: Globe },
          ];

    function goToStep(step: number) {
        setCurrentStep(step);
        if (step > highestReachedStep) {
            setHighestReachedStep(step);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (
            step === 2 &&
            ['aws', 'gcp'].includes(provider.slug) &&
            !refreshedProviders.has(provider.slug) &&
            provider.pricing?.source !== 'live'
        ) {
            void refreshCatalog(provider.slug);
        }
    }

    const canProceedToStep2 =
        !cliMissing &&
        !needsGcpLogin &&
        (!needsToken || form.data.api_token.trim() !== '') &&
        (!needsAwsKeys ||
            (form.data.aws_access_key_id.trim() !== '' &&
                form.data.aws_secret_access_key.trim() !== ''));

    const needsPassphrase =
        isExisting && Boolean(keyInfo.encrypted && !keyInfo.in_agent);

    const canProceedToStep3 =
        canProceedToStep2 &&
        form.data.stack_name.trim() !== '' &&
        (!isExisting ||
            (form.data.ip.trim() !== '' &&
                form.data.ssh_key.trim() !== '' &&
                (!needsPassphrase || form.data.ssh_passphrase.trim() !== '')));

    const hasValidDnsCredentials = (() => {
        if (!form.data.dns_provider) return true;
        if (form.data.dns_provider === 'cloudflare') {
            return form.data.cloudflare_token.trim() !== '';
        }
        if (form.data.dns_provider === 'route53') {
            return (
                form.data.dns_aws_access_key_id.trim() !== '' &&
                form.data.dns_aws_secret_access_key.trim() !== ''
            );
        }
        if (form.data.dns_provider === 'google') {
            return (
                form.data.dns_gcp_project_id.trim() !== '' &&
                form.data.dns_gcp_credentials.trim() !== ''
            );
        }
        return true;
    })();

    const canSubmit = devBox
        ? canProceedToStep3
        : canProceedToStep3 && hasValidDnsCredentials;

    function canGoToStep(stepNumber: number) {
        if (stepNumber === currentStep) return true;
        if (stepNumber === 1) return true;
        if (stepNumber === 2) return canProceedToStep2;
        if (stepNumber === 3) return canProceedToStep3;
        return false;
    }

    useEffect(() => {
        const errorKeys = Object.keys(form.errors);
        if (errorKeys.length === 0) return;

        if (
            !devBox &&
            errorKeys.some((k) =>
                [
                    'cloudflare_token',
                    'dns_provider',
                    'dns_aws_access_key_id',
                    'dns_aws_secret_access_key',
                    'dns_aws_region',
                    'dns_gcp_project_id',
                    'dns_gcp_credentials',
                ].includes(k),
            )
        ) {
            goToStep(3);
        } else if (
            errorKeys.some((k) =>
                [
                    'stack_name',
                    'target_kind',
                    'region',
                    'size',
                    'node_count',
                    'ha',
                    'ip',
                    'ssh_user',
                    'ssh_key',
                    'ssh_passphrase',
                    'ssh_port',
                ].includes(k),
            )
        ) {
            goToStep(2);
        } else if (
            errorKeys.some((k) =>
                [
                    'provider',
                    'api_token',
                    'aws_access_key_id',
                    'aws_secret_access_key',
                    'account',
                ].includes(k),
            )
        ) {
            goToStep(1);
        }
    }, [form.errors]);

    function selectProvider(next: Provider) {
        setOverrideAwsKeys(false);
        const nextCanBeManaged =
            !devBox && (next.managedSizes?.length ?? 0) > 0;
        const nextTargetKind = nextCanBeManaged ? form.data.target_kind : 'vps';
        form.setData({
            ...form.data,
            provider: next.slug,
            region: next.defaultRegion,
            target_kind: nextTargetKind,
            size: startSize(next, nextTargetKind),
            ha: false,
            api_token: '',
            aws_access_key_id: '',
            aws_secret_access_key: '',
            account: next.activeAccount ?? next.accounts?.[0]?.id ?? '',
        });
    }

    function selectTargetKind(next: 'vps' | 'managed') {
        form.setData({
            ...form.data,
            target_kind: next,
            size: startSize(provider, next),
            ha: false,
        });
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        form.post((devBox ? storeDevBox() : store()).url);
    }

    return (
        <>
            <form onSubmit={submit} className="max-w-3xl">
                {/* Stepper Navigation Header */}
                <div className="mb-6 flex items-center justify-between gap-2 border-b border-line pb-5">
                    {steps.map((s, idx) => {
                        const isCurrent = currentStep === s.number;
                        const isCompleted = currentStep > s.number;
                        const isClickable = canGoToStep(s.number);

                        return (
                            <div
                                key={s.number}
                                className="flex flex-1 items-center"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        isClickable && goToStep(s.number)
                                    }
                                    disabled={!isClickable}
                                    className={cn(
                                        'group flex items-center gap-3 text-left transition',
                                        !isClickable &&
                                            'cursor-not-allowed opacity-50',
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition',
                                            isCompleted
                                                ? 'bg-servers text-white'
                                                : isCurrent
                                                  ? 'bg-servers text-white ring-4 ring-servers/20'
                                                  : 'bg-surface text-soft ring-1 ring-line group-hover:ring-soft',
                                        )}
                                    >
                                        {isCompleted ? (
                                            <Check className="size-4 stroke-[2.5]" />
                                        ) : (
                                            <span>{s.number}</span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className={cn(
                                                    'text-xs font-medium',
                                                    isCurrent
                                                        ? 'text-servers'
                                                        : isCompleted
                                                          ? 'text-foreground'
                                                          : 'text-soft',
                                                )}
                                            >
                                                {s.title}
                                            </span>
                                        </div>
                                        <span className="block text-[11px] text-soft">
                                            {s.number === 1 && provider.label}
                                            {s.number === 2 &&
                                                (form.data.stack_name.trim() ||
                                                    'Name & specs')}
                                            {s.number === 3 &&
                                                (form.data.dns_provider
                                                    ? form.data.dns_provider ===
                                                      'cloudflare'
                                                        ? 'Cloudflare'
                                                        : form.data
                                                                .dns_provider ===
                                                            'route53'
                                                          ? 'Route 53'
                                                          : 'Google Cloud'
                                                    : 'Optional & recommended')}
                                        </span>
                                    </div>
                                </button>
                                {idx < steps.length - 1 && (
                                    <div
                                        className={cn(
                                            'mx-3 h-0.5 flex-1 transition',
                                            currentStep > s.number
                                                ? 'bg-servers'
                                                : 'bg-line',
                                        )}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Step 1: Choose Provider */}
                {currentStep === 1 && (
                    <div>
                        <p className="mb-2.5 text-[13px] font-medium">
                            Cloud provider
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {allProviders.map((candidate) => (
                                <button
                                    key={candidate.slug}
                                    type="button"
                                    onClick={() => selectProvider(candidate)}
                                    className={cn(
                                        'flex items-center justify-between rounded-xl bg-surface px-4 py-3.5 text-left transition',
                                        candidate.slug === 'existing' &&
                                            'col-span-2',
                                        candidate.slug === provider.slug
                                            ? 'ring-2 ring-servers'
                                            : 'ring-1 ring-line hover:ring-faint',
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <ProviderLogo
                                            provider={candidate.slug}
                                            size="sm"
                                        />
                                        <div>
                                            <span className="block text-sm font-medium">
                                                {candidate.label}
                                            </span>
                                            {candidate.slug === 'existing' && (
                                                <span className="block text-xs text-soft">
                                                    Any fresh Ubuntu 24.04 or
                                                    26.04 server with SSH root
                                                    access
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <StatusPill
                                        tone={
                                            candidate.credentials.ready
                                                ? 'ok'
                                                : 'muted'
                                        }
                                    >
                                        {candidate.credentials.ready
                                            ? 'Ready'
                                            : 'Not connected'}
                                    </StatusPill>
                                </button>
                            ))}
                        </div>

                        {provider.accounts && provider.accounts.length > 0 && (
                            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                                <div className="flex items-center gap-2.5">
                                    <Users className="size-4 text-soft" />
                                    <div>
                                        <span className="text-foreground text-xs font-medium">
                                            Account / Profile:
                                        </span>
                                        <span className="ml-2 font-mono text-xs text-soft">
                                            {form.data.account ||
                                                provider.activeAccount ||
                                                'default'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {provider.accounts.length > 1 && (
                                        <SelectMenu
                                            value={form.data.account}
                                            accent="servers"
                                            triggerClassName="h-7 bg-background px-2.5 py-1 text-xs"
                                            onChange={(value) =>
                                                form.setData('account', value)
                                            }
                                            options={provider.accounts.map(
                                                (acc) => ({
                                                    value: acc.id,
                                                    label: acc.isDefault
                                                        ? `${acc.label} · (Default)`
                                                        : acc.label,
                                                }),
                                            )}
                                        />
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                            setShowAccountModal(true)
                                        }
                                    >
                                        <Users className="size-3.5" />
                                        <span>Manage Accounts</span>
                                    </Button>
                                </div>
                            </div>
                        )}

                        {(needsGcpLogin || needsAwsKeys || cliMissing) && (
                            <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-warn-tint px-4 py-3 text-sm text-warn">
                                {cliMissing ? (
                                    <>
                                        <span>
                                            {provider.credentials.hint} Install
                                            it from Setup first, then come back
                                            here.
                                        </span>
                                        <Link
                                            href={readiness().url}
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                                'shrink-0',
                                            )}
                                        >
                                            <ExternalLink className="size-3.5" />
                                            <span>Open Setup</span>
                                        </Link>
                                    </>
                                ) : needsGcpLogin ? (
                                    <>
                                        <span>
                                            {provider.credentials.hint}{' '}
                                            Authorize with Google to continue.
                                        </span>
                                        <GcpSignIn label="Sign in with Google" />
                                    </>
                                ) : (
                                    <span>
                                        {provider.credentials.hint} Enter your
                                        AWS keys below to continue.
                                    </span>
                                )}
                            </div>
                        )}

                        {needsToken && (
                            <div className="mt-4 rounded-2xl bg-surface p-5 ring-1 ring-line ring-inset">
                                <Field
                                    label={`${provider.label} API token`}
                                    hint="Used for this run only. Never saved in plaintext."
                                    error={form.errors.api_token}
                                >
                                    <input
                                        type="password"
                                        value={form.data.api_token}
                                        onChange={(event) =>
                                            form.setData(
                                                'api_token',
                                                event.target.value,
                                            )
                                        }
                                        placeholder={`Paste your ${provider.label} API token`}
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                            </div>
                        )}

                        {provider.slug === 'aws' &&
                            provider.credentials.ready && (
                                <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-xs text-soft ring-1 ring-line">
                                    <span>
                                        Using saved AWS credentials
                                        (~/.aws/credentials)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (overrideAwsKeys) {
                                                form.setData(
                                                    'aws_access_key_id',
                                                    '',
                                                );
                                                form.setData(
                                                    'aws_secret_access_key',
                                                    '',
                                                );
                                            }
                                            setOverrideAwsKeys(
                                                !overrideAwsKeys,
                                            );
                                        }}
                                        className="flex items-center gap-1 font-medium text-servers hover:underline"
                                    >
                                        <Key className="size-3" />
                                        <span>
                                            {overrideAwsKeys
                                                ? 'Use saved credentials'
                                                : 'Use different AWS keys'}
                                        </span>
                                    </button>
                                </div>
                            )}

                        {needsAwsKeys && (
                            <div className="mt-4 space-y-4 rounded-2xl bg-surface p-5 ring-1 ring-line ring-inset">
                                <AwsPolicyHelper
                                    includeEks={isManaged}
                                    includeRoute53={
                                        form.data.dns_provider === 'route53'
                                    }
                                />
                                <Field
                                    label="AWS Access Key ID"
                                    error={form.errors.aws_access_key_id}
                                >
                                    <input
                                        type="text"
                                        placeholder="AKIAIOSFODNN7EXAMPLE"
                                        value={form.data.aws_access_key_id}
                                        onChange={(event) =>
                                            form.setData(
                                                'aws_access_key_id',
                                                event.target.value,
                                            )
                                        }
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                                <Field
                                    label="AWS Secret Access Key"
                                    error={form.errors.aws_secret_access_key}
                                >
                                    <input
                                        type="password"
                                        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                        value={form.data.aws_secret_access_key}
                                        onChange={(event) =>
                                            form.setData(
                                                'aws_secret_access_key',
                                                event.target.value,
                                            )
                                        }
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                            </div>
                        )}

                        <div className="mt-6 flex items-center justify-between gap-4">
                            <p className="text-[13px] text-soft">
                                {isExisting
                                    ? 'No cloud API credentials required. Connects securely via SSH.'
                                    : `Billed directly by ${provider.label}. You can destroy your servers at any time.`}
                            </p>
                            <div className="flex items-center gap-2.5">
                                <Link
                                    href={
                                        (devBox ? devBoxesIndex() : index()).url
                                    }
                                    className={buttonClass('ghost')}
                                >
                                    <X className="size-4" />
                                    <span>Cancel</span>
                                </Link>
                                <Button
                                    type="button"
                                    disabled={!canProceedToStep2}
                                    onClick={() => goToStep(2)}
                                >
                                    <span>
                                        Next:{' '}
                                        {devBox
                                            ? 'Customize Dev Box'
                                            : isExisting
                                              ? 'Server & SSH Details'
                                              : 'Customize Server'}
                                    </span>
                                    <ArrowRight className="size-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Customize Server */}
                {currentStep === 2 && (
                    <div>
                        <div className="space-y-4 rounded-2xl bg-surface p-5.5 ring-1 ring-line ring-inset">
                            {isExisting ? (
                                <ExistingServerFields
                                    form={form}
                                    detectedKeys={detectedKeys}
                                    keyInfo={keyInfo}
                                    setKeyInfo={setKeyInfo}
                                    inspectingKey={inspectingKey}
                                    inspectKeyPath={inspectKeyPath}
                                    handlePickKey={handlePickKey}
                                    needsPassphrase={needsPassphrase}
                                    showPassphrase={showPassphrase}
                                    setShowPassphrase={setShowPassphrase}
                                />
                            ) : (
                                <>
                                    <Field
                                        label={
                                            devBox
                                                ? 'Dev box name'
                                                : 'Server name'
                                        }
                                        hint="Lowercase letters, numbers and dashes."
                                        error={form.errors.stack_name}
                                    >
                                        <input
                                            value={form.data.stack_name}
                                            onChange={(event) =>
                                                form.setData(
                                                    'stack_name',
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="workshop-demo"
                                            autoFocus
                                            spellCheck={false}
                                            className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                                        />
                                    </Field>

                                    {canBeManaged && (
                                        <Field
                                            label={
                                                <span className="inline-flex items-center gap-1.5">
                                                    Server architecture
                                                    <InfoTooltip side="right">
                                                        <strong>
                                                            Single server (VPS)
                                                        </strong>{' '}
                                                        runs both the Kubernetes
                                                        control plane and your
                                                        apps on a single virtual
                                                        machine — ideal for
                                                        learning, workshops, and
                                                        low-cost staging.
                                                        <br />
                                                        <br />
                                                        <strong>
                                                            Managed Kubernetes
                                                        </strong>{' '}
                                                        (
                                                        {provider.managedProvider?.toUpperCase()}
                                                        ) offloads the control
                                                        plane to{' '}
                                                        {provider.label} for
                                                        high availability and
                                                        multi-node scaling, but
                                                        costs more.
                                                    </InfoTooltip>
                                                </span>
                                            }
                                            error={form.errors.target_kind}
                                        >
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        selectTargetKind('vps')
                                                    }
                                                    className={cn(
                                                        'relative flex flex-col justify-between rounded-xl p-3.5 text-left transition',
                                                        !isManaged
                                                            ? 'bg-servers/10 ring-2 ring-servers'
                                                            : 'bg-surface/50 ring-1 ring-line hover:ring-faint',
                                                    )}
                                                >
                                                    <div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <Server
                                                                    className={cn(
                                                                        'size-4',
                                                                        !isManaged
                                                                            ? 'text-servers'
                                                                            : 'text-soft',
                                                                    )}
                                                                />
                                                                <span className="text-sm font-semibold">
                                                                    Single
                                                                    server (VPS)
                                                                </span>
                                                            </div>
                                                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                                                Recommended for
                                                                Learning
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 text-xs leading-relaxed text-soft">
                                                            Lightweight{' '}
                                                            <strong>k3s</strong>{' '}
                                                            running on a single
                                                            virtual server.
                                                            Control plane and
                                                            apps share one node.
                                                        </p>
                                                        <ul className="mt-2.5 space-y-1 text-[11px] text-soft">
                                                            <li className="flex items-center gap-1.5">
                                                                <Check className="size-3 shrink-0 text-emerald-500" />
                                                                <span>
                                                                    <strong>
                                                                        Cheapest:
                                                                    </strong>{' '}
                                                                    Pay only for
                                                                    1 VM (no
                                                                    cloud master
                                                                    fees)
                                                                </span>
                                                            </li>
                                                            <li className="flex items-center gap-1.5">
                                                                <Check className="size-3 shrink-0 text-emerald-500" />
                                                                <span>
                                                                    <strong>
                                                                        Self-contained:
                                                                    </strong>{' '}
                                                                    Fast setup,
                                                                    all-in-one
                                                                    Kubernetes
                                                                </span>
                                                            </li>
                                                            <li className="flex items-center gap-1.5">
                                                                <Check className="size-3 shrink-0 text-emerald-500" />
                                                                <span>
                                                                    <strong>
                                                                        Best
                                                                        for:
                                                                    </strong>{' '}
                                                                    Workshops,
                                                                    demos, side
                                                                    projects
                                                                    &amp; MVPs
                                                                </span>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                    {untested.capabilities.includes(
                                                        'vps-to-managed',
                                                    ) && (
                                                        <span className="mt-3 block border-t border-line/60 pt-2 text-[10px] text-faint">
                                                            Switching to Managed
                                                            later is possible
                                                            via the CLI
                                                            (experimental).
                                                        </span>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        selectTargetKind(
                                                            'managed',
                                                        )
                                                    }
                                                    className={cn(
                                                        'relative flex flex-col justify-between rounded-xl p-3.5 text-left transition',
                                                        isManaged
                                                            ? 'bg-servers/10 ring-2 ring-servers'
                                                            : 'bg-surface/50 ring-1 ring-line hover:ring-faint',
                                                    )}
                                                >
                                                    <div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <Layers
                                                                    className={cn(
                                                                        'size-4',
                                                                        isManaged
                                                                            ? 'text-servers'
                                                                            : 'text-soft',
                                                                    )}
                                                                />
                                                                <span className="text-sm font-semibold">
                                                                    Managed
                                                                    Kubernetes
                                                                </span>
                                                            </div>
                                                            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-400">
                                                                {provider.managedProvider?.toUpperCase()}{' '}
                                                                · Production
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 text-xs leading-relaxed text-soft">
                                                            <strong>
                                                                {provider.label}
                                                            </strong>{' '}
                                                            manages master
                                                            nodes, etcd, and
                                                            control plane uptime
                                                            behind an SLA.
                                                        </p>
                                                        <ul className="mt-2.5 space-y-1 text-[11px] text-soft">
                                                            <li className="flex items-center gap-1.5">
                                                                <Check className="size-3 shrink-0 text-indigo-500" />
                                                                <span>
                                                                    <strong>
                                                                        Cloud-managed:
                                                                    </strong>{' '}
                                                                    Provider
                                                                    manages
                                                                    Kubernetes
                                                                    control
                                                                    plane
                                                                </span>
                                                            </li>
                                                            <li className="flex items-center gap-1.5">
                                                                <Check className="size-3 shrink-0 text-indigo-500" />
                                                                <span>
                                                                    <strong>
                                                                        Multi-node:
                                                                    </strong>{' '}
                                                                    Worker nodes
                                                                    scale across
                                                                    multiple
                                                                    instances
                                                                </span>
                                                            </li>
                                                            <li className="flex items-center gap-1.5">
                                                                <Check className="size-3 shrink-0 text-indigo-500" />
                                                                <span>
                                                                    <strong>
                                                                        Best
                                                                        for:
                                                                    </strong>{' '}
                                                                    Production
                                                                    workloads
                                                                    requiring
                                                                    high
                                                                    availability
                                                                </span>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                    {provider.slug ===
                                                        'aws' && (
                                                        <span className="mt-3 block border-t border-line/60 pt-2 text-[10px] text-amber-600 dark:text-amber-400">
                                                            Note: AWS charges a
                                                            flat ~$73/mo for the
                                                            EKS control plane.
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        </Field>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <Field
                                            label="Region"
                                            error={form.errors.region}
                                        >
                                            <Select
                                                value={form.data.region}
                                                onChange={(value) =>
                                                    form.setData(
                                                        'region',
                                                        value,
                                                    )
                                                }
                                                options={provider.regions}
                                                searchable={
                                                    provider.regions.length > 8
                                                }
                                            />
                                        </Field>
                                        <Field
                                            label={
                                                <span className="inline-flex items-center gap-1.5">
                                                    Size
                                                    {isRefreshingCatalog && (
                                                        <span className="inline-flex items-center gap-1 text-xs font-normal text-soft">
                                                            <RotateCw className="h-3 w-3 animate-spin text-accent" />
                                                            Refreshing types...
                                                        </span>
                                                    )}
                                                </span>
                                            }
                                            error={form.errors.size}
                                            hint={pricingNote(provider)}
                                        >
                                            <Select
                                                value={form.data.size}
                                                onChange={(value) =>
                                                    form.setData('size', value)
                                                }
                                                options={sizeOptions}
                                                searchable={
                                                    sizeOptions.length > 8
                                                }
                                            />
                                        </Field>
                                    </div>

                                    {!isManaged && (
                                        <Field
                                            label={
                                                <span className="inline-flex items-center gap-1.5">
                                                    SSH port
                                                    <InfoTooltip side="right">
                                                        Port the SSH daemon will
                                                        listen on. Default is{' '}
                                                        <strong>22</strong>.
                                                        <br />
                                                        <br />
                                                        If your local network,
                                                        university, or corporate
                                                        firewall blocks outbound
                                                        port 22, choose an
                                                        alternate port such as{' '}
                                                        <strong>
                                                            8443
                                                        </strong> or{' '}
                                                        <strong>2200</strong>.
                                                    </InfoTooltip>
                                                </span>
                                            }
                                            hint={
                                                <span className="flex flex-wrap items-center gap-2 pt-1">
                                                    <span className="text-xs text-soft">
                                                        Firewall bypass presets:
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            form.setData(
                                                                'ssh_port',
                                                                8443,
                                                            )
                                                        }
                                                        className={cn(
                                                            'rounded px-2 py-0.5 font-mono text-xs ring-1 transition',
                                                            Number(
                                                                form.data
                                                                    .ssh_port,
                                                            ) === 8443
                                                                ? 'bg-servers/15 text-servers ring-servers'
                                                                : 'bg-surface text-soft ring-line hover:text-ink hover:ring-faint',
                                                        )}
                                                    >
                                                        8443 (Recommended)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            form.setData(
                                                                'ssh_port',
                                                                2200,
                                                            )
                                                        }
                                                        className={cn(
                                                            'rounded px-2 py-0.5 font-mono text-xs ring-1 transition',
                                                            Number(
                                                                form.data
                                                                    .ssh_port,
                                                            ) === 2200
                                                                ? 'bg-servers/15 text-servers ring-servers'
                                                                : 'bg-surface text-soft ring-line hover:text-ink hover:ring-faint',
                                                        )}
                                                    >
                                                        2200
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            form.setData(
                                                                'ssh_port',
                                                                22,
                                                            )
                                                        }
                                                        className={cn(
                                                            'rounded px-2 py-0.5 font-mono text-xs ring-1 transition',
                                                            Number(
                                                                form.data
                                                                    .ssh_port,
                                                            ) === 22
                                                                ? 'bg-servers/15 text-servers ring-servers'
                                                                : 'bg-surface text-soft ring-line hover:text-ink hover:ring-faint',
                                                        )}
                                                    >
                                                        22 (Default)
                                                    </button>
                                                </span>
                                            }
                                            error={form.errors.ssh_port}
                                        >
                                            <div className="space-y-1.5">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={65535}
                                                    value={form.data.ssh_port}
                                                    onChange={(event) =>
                                                        form.setData(
                                                            'ssh_port',
                                                            event.target
                                                                .value === ''
                                                                ? 22
                                                                : parseInt(
                                                                      event
                                                                          .target
                                                                          .value,
                                                                      10,
                                                                  ) || 22,
                                                        )
                                                    }
                                                    placeholder="22"
                                                    className="w-full max-w-xs rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                                {Number(form.data.ssh_port) ===
                                                    443 && (
                                                    <p className="text-xs text-rose-500">
                                                        Port 443 is reserved for
                                                        Traefik HTTPS ingress on
                                                        single-node VPS. Choose
                                                        an alternate like 8443.
                                                    </p>
                                                )}
                                                {Number(form.data.ssh_port) ===
                                                    80 && (
                                                    <p className="text-xs text-rose-500">
                                                        Port 80 is reserved for
                                                        Traefik HTTP web
                                                        ingress. Choose an
                                                        alternate like 8443.
                                                    </p>
                                                )}
                                                {Number(form.data.ssh_port) ===
                                                    2222 && (
                                                    <p className="text-xs text-rose-500">
                                                        Port 2222 is reserved
                                                        for Git (Forgejo) SSH
                                                        service. Choose an
                                                        alternate like 8443 or
                                                        2200.
                                                    </p>
                                                )}
                                            </div>
                                        </Field>
                                    )}

                                    {isManaged && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <Field
                                                label="Node count"
                                                error={form.errors.node_count}
                                            >
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={20}
                                                    value={form.data.node_count}
                                                    onChange={(event) =>
                                                        form.setData(
                                                            'node_count',
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                                />
                                            </Field>
                                            {provider.haOption === 'boolean' ? (
                                                <Field
                                                    label={
                                                        <span className="inline-flex items-center gap-1">
                                                            Control plane
                                                            <InfoTooltip side="right">
                                                                The control
                                                                plane is what
                                                                runs Kubernetes
                                                                itself (the API
                                                                server,
                                                                scheduler, etcd)
                                                                — separate from
                                                                your worker
                                                                node(s).
                                                                Unchecked, it
                                                                runs in a single
                                                                zone for free:
                                                                fine for
                                                                learning or a
                                                                demo, but an
                                                                outage in that
                                                                zone takes the
                                                                whole cluster
                                                                down with it.
                                                                Checked, it
                                                                spans multiple
                                                                zones for{' '}
                                                                {provider.haCost ??
                                                                    'an extra charge'}
                                                                , so the cluster
                                                                survives one
                                                                zone going down
                                                                — what most
                                                                production
                                                                setups choose.
                                                            </InfoTooltip>
                                                        </span>
                                                    }
                                                >
                                                    <label className="flex h-9 items-center gap-2 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                form.data.ha
                                                            }
                                                            onChange={(event) =>
                                                                form.setData(
                                                                    'ha',
                                                                    event.target
                                                                        .checked,
                                                                )
                                                            }
                                                            className="size-4 rounded ring-1 ring-line"
                                                        />
                                                        <span>
                                                            High availability
                                                            {provider.haCost
                                                                ? ` (${provider.haCost})`
                                                                : ''}
                                                        </span>
                                                    </label>
                                                </Field>
                                            ) : (
                                                provider.haOption ===
                                                    'always' && (
                                                    <Field
                                                        label={
                                                            <span className="inline-flex items-center gap-1">
                                                                Control plane
                                                                <InfoTooltip side="right">
                                                                    The control
                                                                    plane is
                                                                    what runs
                                                                    Kubernetes
                                                                    itself (the
                                                                    API server,
                                                                    scheduler,
                                                                    etcd) —
                                                                    separate
                                                                    from your
                                                                    node(s).{' '}
                                                                    {
                                                                        provider.label
                                                                    }{' '}
                                                                    always spans
                                                                    it across
                                                                    multiple
                                                                    availability
                                                                    zones —
                                                                    there's no
                                                                    cheaper,
                                                                    single-zone
                                                                    option to
                                                                    opt out of —
                                                                    which is why
                                                                    it isn't a
                                                                    checkbox
                                                                    here like it
                                                                    is for some
                                                                    other
                                                                    providers.
                                                                    It costs{' '}
                                                                    {provider.haCost ??
                                                                        'a flat hourly fee'}
                                                                    , billed on
                                                                    top of your
                                                                    node(s)
                                                                    regardless
                                                                    of cluster
                                                                    size.
                                                                </InfoTooltip>
                                                            </span>
                                                        }
                                                    >
                                                        <p className="flex h-9 items-center text-sm text-soft">
                                                            High availability
                                                            included
                                                        </p>
                                                    </Field>
                                                )
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="mt-6 flex items-center justify-between gap-4">
                            <p className="text-[13px] text-soft">
                                {isExisting
                                    ? 'Existing server will be initialized as a single-node K3s cluster.'
                                    : isManaged && monthlyEstimate
                                      ? `${monthlyEstimate.replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                                      : price
                                        ? `${provider.pricing?.source === 'builtin' ? 'Roughly' : 'About'} ${price.replace(', Recommended', '').replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                                        : `Billed by ${provider.label}. You can destroy it any time.`}
                            </p>
                            <div className="flex items-center gap-2.5">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => goToStep(1)}
                                >
                                    <ArrowLeft className="size-4" />
                                    <span>Back to Provider</span>
                                </Button>
                                {devBox ? (
                                    <Button
                                        type="submit"
                                        disabled={form.processing || !canSubmit}
                                    >
                                        <Plus className="size-4" />
                                        <span>
                                            {form.processing
                                                ? 'Starting…'
                                                : 'Create dev box'}
                                        </span>
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            disabled={
                                                form.processing ||
                                                !canProceedToStep3
                                            }
                                            title="Provision server immediately without configuring DNS or SSL automation"
                                        >
                                            <Plus className="size-4" />
                                            <span>
                                                {isExisting
                                                    ? 'Provision without DNS'
                                                    : 'Create without DNS'}
                                            </span>
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={!canProceedToStep3}
                                            onClick={() => goToStep(3)}
                                        >
                                            <span>Next: DNS & SSL</span>
                                            <ArrowRight className="size-4" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Automate DNS & SSL (Regular Server Only) */}
                {!devBox && currentStep === 3 && (
                    <div>
                        <DnsAutomationStep form={form} provider={provider} />

                        <div className="mt-6 flex items-center justify-between gap-4">
                            <p className="text-[13px] text-soft">
                                {isExisting
                                    ? 'Existing server will be initialized as a single-node K3s cluster.'
                                    : isManaged && monthlyEstimate
                                      ? `${monthlyEstimate.replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                                      : price
                                        ? `${provider.pricing?.source === 'builtin' ? 'Roughly' : 'About'} ${price.replace(', Recommended', '').replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                                        : `Billed by ${provider.label}. You can destroy it any time.`}
                            </p>
                            <div className="flex items-center gap-2.5">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => goToStep(2)}
                                >
                                    <ArrowLeft className="size-4" />
                                    <span>
                                        Back to{' '}
                                        {isExisting
                                            ? 'Server & SSH'
                                            : 'Server Specs'}
                                    </span>
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={form.processing || !canSubmit}
                                >
                                    <Plus className="size-4" />
                                    <span>
                                        {form.processing
                                            ? 'Starting…'
                                            : isExisting
                                              ? 'Provision server'
                                              : 'Create server'}
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </form>
            {showAccountModal && (
                <CloudAccountsModal
                    provider={provider}
                    onClose={() => setShowAccountModal(false)}
                />
            )}
        </>
    );
}

/** A rough total monthly estimate: per-node price × node count, plus HA's own cost if enabled. */
function estimateManagedCost(
    priceLabel: string | undefined,
    nodeCount: number,
    ha: boolean,
    haCost?: string | null,
): string | undefined {
    const perNode = priceLabel?.match(/\$([\d.]+)/)?.[1];
    if (!perNode) return undefined;

    const total = parseFloat(perNode) * nodeCount;
    const base = `~$${Math.round(total)}/mo for ${nodeCount} node${nodeCount === 1 ? '' : 's'}`;

    return ha && haCost ? `${base}, plus ${haCost} for HA` : base;
}

/** The optional Cloudflare step: what it gives, how to get a token, and that it can wait. */
/** Says where the sizes and prices come from, so a stale one is never passed off as current. */
function pricingNote(provider: Provider): ReactNode {
    const pricing = provider.pricing;

    if (!pricing) return undefined;

    // AWS/GCP: their size-listing APIs carry no price at all, so this is
    // never a live number — regardless of whether the regions/sizes
    // themselves were just confirmed live or are the static fallback.
    if (pricing.priceIsEstimated) {
        const regionsNote =
            pricing.source === 'live'
                ? `Regions and sizes confirmed live from ${provider.label}.`
                : `Regions and sizes are our best-known list for ${provider.label}.`;

        return (
            <>
                {regionsNote} Prices are estimates —{' '}
                {pricing.officialPricingUrl ? (
                    <button
                        type="button"
                        className="underline hover:text-ink"
                        onClick={() => {
                            void openExternalUrl(pricing.officialPricingUrl);
                        }}
                    >
                        see {provider.label}&rsquo;s current pricing
                    </button>
                ) : (
                    `see ${provider.label}'s current pricing`
                )}
                .
            </>
        );
    }

    if (pricing.source === 'live') {
        return `Prices from ${provider.label}, fetched ${ago(pricing.asOf)}.`;
    }

    if (pricing.source === 'cached') {
        return `Couldn't reach ${provider.label} just now. These prices are from ${ago(pricing.asOf)} and may have changed.`;
    }

    return `Estimated prices, which may be out of date.${provider.credentials.ready ? '' : ` Connect ${provider.label} to see its current ones.`}`;
}

function ago(iso: string | null): string {
    const minutes = iso
        ? Math.round((Date.now() - new Date(iso).getTime()) / 60000)
        : 0;

    if (minutes < 2) return 'just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hours ago`;

    return `${Math.round(minutes / 1440)} days ago`;
}

function DnsAutomationStep({
    form,
    provider,
}: {
    form: ReturnType<typeof useForm<any>>;
    provider: Provider;
}) {
    return (
        <div className="space-y-4 rounded-2xl bg-surface p-5.5 ring-1 ring-line ring-inset">
            <div className="text-foreground rounded-xl border border-servers/30 bg-servers/5 p-4 text-xs leading-relaxed">
                <div className="flex items-center gap-2 font-medium text-servers">
                    <Globe className="size-4 shrink-0" />
                    <span className="text-sm font-semibold">
                        Recommended for Workshops & Production
                    </span>
                </div>
                <p className="mt-1.5 text-soft">
                    Automate DNS records for every tool and application deployed
                    to this cluster (via ExternalDNS), and issue Let's Encrypt
                    wildcard SSL certificates automatically via DNS-01 challenge
                    (even for proxied or wildcard domains).
                </p>
            </div>

            <DnsTlsFields
                values={{
                    dns_provider: form.data.dns_provider as DnsTlsProvider,
                    enable_dns: form.data.enable_dns,
                    enable_tls: form.data.enable_tls,
                    cloudflare_token: form.data.cloudflare_token,
                    dns_aws_access_key_id: form.data.dns_aws_access_key_id,
                    dns_aws_secret_access_key:
                        form.data.dns_aws_secret_access_key,
                    dns_aws_region: form.data.dns_aws_region,
                    dns_gcp_project_id: form.data.dns_gcp_project_id,
                    dns_gcp_credentials: form.data.dns_gcp_credentials,
                }}
                onChange={(field, val) =>
                    form.setData(field as any, val as any)
                }
                errors={form.errors}
                serverProvider={provider.slug}
                serverRegion={form.data.region}
                allowEmptyProvider={true}
                copyAwsKeys={() => {
                    form.setData(
                        'dns_aws_access_key_id',
                        form.data.aws_access_key_id,
                    );
                    form.setData(
                        'dns_aws_secret_access_key',
                        form.data.aws_secret_access_key,
                    );
                    form.setData(
                        'dns_aws_region',
                        form.data.region || 'us-east-1',
                    );
                }}
                copyGcpProjectId={() => {
                    if (form.data.project_id) {
                        form.setData(
                            'dns_gcp_project_id',
                            String(form.data.project_id),
                        );
                    }
                }}
            />
        </div>
    );
}

function ExistingServerFields({
    form,
    detectedKeys,
    keyInfo,
    setKeyInfo,
    inspectingKey,
    inspectKeyPath,
    handlePickKey,
    needsPassphrase,
    showPassphrase,
    setShowPassphrase,
}: {
    form: ReturnType<typeof useForm<any>>;
    detectedKeys: Array<{
        path: string;
        label: string;
        encrypted: boolean;
        in_agent: boolean;
    }>;
    keyInfo: { valid?: boolean; encrypted?: boolean; in_agent?: boolean };
    setKeyInfo: (info: {
        valid?: boolean;
        encrypted?: boolean;
        in_agent?: boolean;
    }) => void;
    inspectingKey: boolean;
    inspectKeyPath: (path: string) => Promise<void>;
    handlePickKey: () => Promise<void>;
    needsPassphrase: boolean;
    showPassphrase: boolean;
    setShowPassphrase: (show: boolean) => void;
}) {
    return (
        <>
            <div className="grid grid-cols-2 gap-4">
                <Field
                    label="Server / Stack name"
                    hint="Lowercase letters, numbers and dashes."
                    error={form.errors.stack_name}
                >
                    <input
                        value={form.data.stack_name}
                        onChange={(event) =>
                            form.setData('stack_name', event.target.value)
                        }
                        placeholder="production-vps"
                        autoFocus
                        spellCheck={false}
                        className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                    />
                </Field>

                <Field
                    label="Server IP Address"
                    hint="Public IPv4 address of your fresh Ubuntu server."
                    error={form.errors.ip}
                >
                    <input
                        value={form.data.ip}
                        onChange={(event) => {
                            const ip = event.target.value;
                            form.setData('ip', ip);
                            if (
                                !form.data.stack_name ||
                                form.data.stack_name.startsWith('vps-')
                            ) {
                                const cleanIp = ip.trim().replace(/\./g, '-');
                                if (cleanIp) {
                                    form.setData(
                                        'stack_name',
                                        `vps-${cleanIp}`,
                                    );
                                }
                            }
                        }}
                        placeholder="123.45.67.89"
                        spellCheck={false}
                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                    />
                </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Field
                    label="SSH User"
                    hint="Initial user with sudo/root privileges."
                    error={form.errors.ssh_user}
                >
                    <input
                        value={form.data.ssh_user}
                        onChange={(event) =>
                            form.setData('ssh_user', event.target.value)
                        }
                        placeholder="root"
                        spellCheck={false}
                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                    />
                </Field>

                <Field
                    label="SSH Port"
                    hint="Standard SSH port is 22."
                    error={form.errors.ssh_port}
                >
                    <input
                        type="number"
                        min={1}
                        max={65535}
                        value={form.data.ssh_port}
                        onChange={(event) =>
                            form.setData(
                                'ssh_port',
                                event.target.value === ''
                                    ? 22
                                    : parseInt(event.target.value, 10) || 22,
                            )
                        }
                        placeholder="22"
                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                    />
                </Field>
            </div>

            <Field
                label="SSH Private Key"
                hint="Private key on this computer used to connect to the server."
                error={form.errors.ssh_key}
            >
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <input
                            value={form.data.ssh_key}
                            onChange={(event) => {
                                const path = event.target.value;
                                form.setData('ssh_key', path);
                                void inspectKeyPath(path);
                            }}
                            placeholder="~/.ssh/id_ed25519"
                            spellCheck={false}
                            className="flex-1 rounded-lg border-0 px-3 py-2 font-mono text-xs ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void handlePickKey()}
                        >
                            <FolderOpen className="size-3.5" />
                            <span>Browse…</span>
                        </Button>
                    </div>

                    {detectedKeys.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[11px] text-soft">
                                Detected keys:
                            </span>
                            {detectedKeys.map((dk) => (
                                <button
                                    key={dk.path}
                                    type="button"
                                    onClick={() => {
                                        form.setData('ssh_key', dk.path);
                                        setKeyInfo({
                                            valid: true,
                                            encrypted: dk.encrypted,
                                            in_agent: dk.in_agent,
                                        });
                                    }}
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] ring-1 transition',
                                        form.data.ssh_key === dk.path
                                            ? 'bg-servers/15 font-medium text-servers ring-servers'
                                            : 'bg-surface text-soft ring-line hover:text-ink hover:ring-faint',
                                    )}
                                >
                                    <Key className="size-2.5" />
                                    <span>{dk.label}</span>
                                    {dk.encrypted && !dk.in_agent && (
                                        <Lock className="size-2.5 text-warn" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {form.data.ssh_key && (
                        <div className="flex items-center gap-2 pt-1 text-xs">
                            {inspectingKey ? (
                                <span className="text-soft">
                                    Inspecting key…
                                </span>
                            ) : keyInfo.valid === false ? (
                                <span className="text-bad">
                                    File does not exist or cannot be read.
                                </span>
                            ) : keyInfo.encrypted ? (
                                keyInfo.in_agent ? (
                                    <span className="inline-flex items-center gap-1 text-ok">
                                        <ShieldCheck className="size-3.5" />
                                        Passphrase loaded in SSH Agent
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-warn">
                                        <Lock className="size-3.5" />
                                        Key is passphrase-protected
                                    </span>
                                )
                            ) : (
                                <span className="inline-flex items-center gap-1 text-soft">
                                    <Check className="size-3.5 text-ok" />
                                    Unencrypted key ready
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </Field>

            {needsPassphrase && (
                <Field
                    label="SSH Key Passphrase"
                    hint="Used in-memory to unlock your key during provisioning. Never stored on disk."
                    error={form.errors.ssh_passphrase}
                >
                    <div className="relative max-w-md">
                        <input
                            type={showPassphrase ? 'text' : 'password'}
                            value={form.data.ssh_passphrase}
                            onChange={(event) =>
                                form.setData(
                                    'ssh_passphrase',
                                    event.target.value,
                                )
                            }
                            placeholder="Enter private key passphrase"
                            className="w-full rounded-lg border-0 px-3 py-2 pr-10 font-mono text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassphrase(!showPassphrase)}
                            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-soft transition hover:text-ink"
                        >
                            {showPassphrase ? (
                                <EyeOff className="size-4" />
                            ) : (
                                <Eye className="size-4" />
                            )}
                        </button>
                    </div>
                </Field>
            )}

            <div className="rounded-xl border border-line bg-surface/50 p-3.5 text-xs leading-relaxed text-soft">
                <p>
                    <strong>What happens next:</strong> LaraKube will connect to
                    your server via SSH, install K3s, configure Traefik Ingress,
                    create a dedicated passwordless{' '}
                    <code className="text-foreground font-mono font-semibold">
                        larakube
                    </code>{' '}
                    system user, and link your local context to the server.
                </p>
            </div>
        </>
    );
}

function Field({
    label,
    hint,
    error,
    children,
}: {
    label: ReactNode;
    hint?: ReactNode;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div className="block">
            <label className="mb-1.5 block text-xs font-medium text-soft">
                {label}
            </label>
            {children}
            {error ? (
                <span className="text-bad mt-1 block text-xs">{error}</span>
            ) : (
                hint && (
                    <span className="mt-1 block text-xs text-soft">{hint}</span>
                )
            )}
        </div>
    );
}

function Select({
    value,
    onChange,
    options,
    searchable = false,
}: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    searchable?: boolean;
}) {
    return (
        <SelectMenu
            value={value}
            onChange={onChange}
            accent="servers"
            options={options}
            searchable={searchable}
        />
    );
}
