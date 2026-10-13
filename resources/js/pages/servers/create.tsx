import { Deferred, Link, useForm, usePage } from '@inertiajs/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Globe, Key, Plus, Users } from 'lucide-react';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import { buttonClass } from '@/components/button';
import Button from '@/components/button';
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
import { ExternalLinkButton, openExternalUrl } from '@/lib/open-external';
import {
    index as devBoxesIndex,
    store as storeDevBox,
} from '@/routes/devboxes';
import { index, store } from '@/routes/servers';
import type { Provider, Untested } from '@/types/larakube';

const tokenProviders = ['do', 'hetzner'];

export default function CreateServer({
    providers,
    project,
    kind = 'server',
    defaultProvider,
}: {
    providers?: Provider[] | null;
    project: { id: number; name: string } | null;
    kind?: 'server' | 'dev-box';
    defaultProvider?: string;
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
            <Deferred
                data="providers"
                fallback={
                    <div className="h-72 max-w-3xl animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {providers && providers.length > 0 ? (
                    <ServerForm
                        providers={providers}
                        projectId={project?.id ?? null}
                        devBox={devBox}
                        defaultProvider={defaultProvider}
                    />
                ) : (
                    <p className="text-sm text-soft">
                        The LaraKube CLI isn't ready yet. Finish Setup first.
                    </p>
                )}
            </Deferred>
        </AppLayout>
    );
}

function ServerForm({
    providers,
    projectId,
    devBox,
    defaultProvider,
}: {
    providers: Provider[];
    projectId: number | null;
    devBox: boolean;
    defaultProvider?: string;
}) {
    const { untested } = usePage<{ untested: Untested }>().props;
    const startSize = (candidate: Provider, targetKind: 'vps' | 'managed') =>
        targetKind === 'managed'
            ? (candidate.defaultManagedSize ?? candidate.defaultVpsSize)
            : devBox
              ? (candidate.defaultDevBoxSize ?? candidate.defaultVpsSize)
              : candidate.defaultVpsSize;
    const initial =
        providers.find(
            (provider) =>
                provider.slug === defaultProvider && provider.credentials.ready,
        ) ??
        providers.find((provider) => provider.credentials.ready) ??
        providers[0];
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
    });

    const [overrideAwsKeys, setOverrideAwsKeys] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);

    const provider =
        providers.find((candidate) => candidate.slug === form.data.provider) ??
        initial;

    const needsToken =
        tokenProviders.includes(provider.slug) && !provider.credentials.ready;
    const needsAwsKeys =
        provider.slug === 'aws' &&
        (!provider.credentials.ready || overrideAwsKeys);
    const needsGcpLogin =
        provider.slug === 'gcp' && !provider.credentials.ready;
    const cliMissing = /not installed/i.test(provider.credentials.hint ?? '');

    const canBeManaged = !devBox && (provider.managedSizes?.length ?? 0) > 0;
    const isManaged = form.data.target_kind === 'managed' && canBeManaged;
    const sizeOptions =
        (isManaged ? provider.managedSizes : provider.vpsSizes) ?? [];
    const size = sizeOptions.find((option) => option.value === form.data.size);
    const price = size?.label.match(/\(([^)]*\/mo[^)]*)\)/)?.[1];
    const nodeCount = Math.max(1, parseInt(form.data.node_count, 10) || 1);
    const monthlyEstimate = isManaged
        ? estimateManagedCost(price, nodeCount, form.data.ha, provider.haCost)
        : undefined;

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
                <p className="mb-2.5 text-[13px] font-medium">Cloud provider</p>
                <div className="grid grid-cols-2 gap-3">
                    {providers.map((candidate) => (
                        <button
                            key={candidate.slug}
                            type="button"
                            onClick={() => selectProvider(candidate)}
                            className={cn(
                                'flex items-center justify-between rounded-xl bg-surface px-4 py-3.5 text-left transition',
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
                                <span className="text-sm font-medium">
                                    {candidate.label}
                                </span>
                            </div>
                            <StatusPill
                                tone={
                                    candidate.credentials.ready ? 'ok' : 'muted'
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
                                    options={provider.accounts.map((acc) => ({
                                        value: acc.id,
                                        label: acc.isDefault
                                            ? `${acc.label} · (Default)`
                                            : acc.label,
                                    }))}
                                />
                            )}
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setShowAccountModal(true)}
                            >
                                <Plus className="size-3" />
                                <span>Manage Accounts</span>
                            </Button>
                        </div>
                    </div>
                )}

                {(needsGcpLogin || needsAwsKeys) && (
                    <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-warn-tint px-4 py-3 text-sm text-warn">
                        {cliMissing ? (
                            <>
                                <span>
                                    {provider.credentials.hint} Install it from
                                    Setup first, then come back here.
                                </span>
                                <Link
                                    href={readiness().url}
                                    className={buttonClass(
                                        'secondary',
                                        'sm',
                                        'shrink-0',
                                    )}
                                >
                                    Open Setup
                                </Link>
                            </>
                        ) : needsGcpLogin ? (
                            <>
                                <span>
                                    {provider.credentials.hint} Authorize with
                                    Google to continue.
                                </span>
                                <GcpSignIn label="Sign in with Google" />
                            </>
                        ) : (
                            <span>
                                {provider.credentials.hint} Enter your AWS keys
                                below to continue.
                            </span>
                        )}
                    </div>
                )}

                <div className="mt-5 space-y-4 rounded-2xl bg-surface p-5.5 ring-1 ring-line ring-inset">
                    <Field
                        label={devBox ? 'Dev box name' : 'Server name'}
                        hint="Lowercase letters, numbers and dashes."
                        error={form.errors.stack_name}
                    >
                        <input
                            value={form.data.stack_name}
                            onChange={(event) =>
                                form.setData('stack_name', event.target.value)
                            }
                            placeholder="workshop-demo"
                            autoFocus
                            spellCheck={false}
                            className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                        />
                    </Field>

                    {canBeManaged && (
                        <Field
                            label="Server type"
                            error={form.errors.target_kind}
                        >
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => selectTargetKind('vps')}
                                    className={cn(
                                        'rounded-lg px-3 py-2 text-left text-sm transition',
                                        !isManaged
                                            ? 'bg-servers/10 ring-2 ring-servers'
                                            : 'ring-1 ring-line hover:ring-faint',
                                    )}
                                >
                                    <span className="block font-medium">
                                        Single server (VPS)
                                    </span>
                                    <span className="block text-xs text-soft">
                                        k3s, single-node — cheapest, simplest
                                        {untested.capabilities.includes(
                                            'vps-to-managed',
                                        ) && (
                                            <>
                                                . Switching to Managed later is
                                                possible via the CLI, but that
                                                path isn't fully validated yet.
                                            </>
                                        )}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => selectTargetKind('managed')}
                                    className={cn(
                                        'rounded-lg px-3 py-2 text-left text-sm transition',
                                        isManaged
                                            ? 'bg-servers/10 ring-2 ring-servers'
                                            : 'ring-1 ring-line hover:ring-faint',
                                    )}
                                >
                                    <span className="block font-medium">
                                        Managed Kubernetes
                                    </span>
                                    <span className="block text-xs text-soft">
                                        {provider.managedProvider?.toUpperCase()}{' '}
                                        — multi-node, scales with your traffic
                                    </span>
                                </button>
                            </div>
                        </Field>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Region" error={form.errors.region}>
                            <Select
                                value={form.data.region}
                                onChange={(value) =>
                                    form.setData('region', value)
                                }
                                options={provider.regions}
                                searchable={provider.regions.length > 8}
                            />
                        </Field>
                        <Field
                            label="Size"
                            error={form.errors.size}
                            hint={pricingNote(provider)}
                        >
                            <Select
                                value={form.data.size}
                                onChange={(value) =>
                                    form.setData('size', value)
                                }
                                options={sizeOptions}
                                searchable={sizeOptions.length > 8}
                            />
                        </Field>
                    </div>

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
                                                The control plane is what runs
                                                Kubernetes itself (the API
                                                server, scheduler, etcd) —
                                                separate from your worker
                                                node(s). Unchecked, it runs in a
                                                single zone for free: fine for
                                                learning or a demo, but an
                                                outage in that zone takes the
                                                whole cluster down with it.
                                                Checked, it spans multiple zones
                                                for{' '}
                                                {provider.haCost ??
                                                    'an extra charge'}
                                                , so the cluster survives one
                                                zone going down — what most
                                                production setups choose.
                                            </InfoTooltip>
                                        </span>
                                    }
                                >
                                    <label className="flex h-9 items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={form.data.ha}
                                            onChange={(event) =>
                                                form.setData(
                                                    'ha',
                                                    event.target.checked,
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
                                provider.haOption === 'always' && (
                                    <Field
                                        label={
                                            <span className="inline-flex items-center gap-1">
                                                Control plane
                                                <InfoTooltip side="right">
                                                    The control plane is what
                                                    runs Kubernetes itself (the
                                                    API server, scheduler, etcd)
                                                    — separate from your
                                                    node(s). {
                                                        provider.label
                                                    }{' '}
                                                    always spans it across
                                                    multiple availability zones
                                                    — there's no cheaper,
                                                    single-zone option to opt
                                                    out of — which is why it
                                                    isn't a checkbox here like
                                                    it is for some other
                                                    providers. It costs{' '}
                                                    {provider.haCost ??
                                                        'a flat hourly fee'}
                                                    , billed on top of your
                                                    node(s) regardless of
                                                    cluster size.
                                                </InfoTooltip>
                                            </span>
                                        }
                                    >
                                        <p className="flex h-9 items-center text-sm text-soft">
                                            High availability included
                                        </p>
                                    </Field>
                                )
                            )}
                        </div>
                    )}

                    {needsToken && (
                        <Field
                            label={`${provider.label} API token`}
                            hint="Used for this run only. Never saved."
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
                                className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                            />
                        </Field>
                    )}

                    {provider.slug === 'aws' && provider.credentials.ready && (
                        <div className="flex items-center justify-between border-t border-line/60 pt-3 text-xs text-soft">
                            <span>
                                Using saved AWS credentials (~/.aws/credentials)
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (overrideAwsKeys) {
                                        form.setData('aws_access_key_id', '');
                                        form.setData(
                                            'aws_secret_access_key',
                                            '',
                                        );
                                    }
                                    setOverrideAwsKeys(!overrideAwsKeys);
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
                        <div className="space-y-4 border-t border-line/60 pt-3">
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

                    {!devBox && (
                        <DnsAutomationOption form={form} provider={provider} />
                    )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-4">
                    <p className="text-[13px] text-soft">
                        {isManaged && monthlyEstimate
                            ? `${monthlyEstimate.replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                            : price
                              ? `${provider.pricing?.source === 'builtin' ? 'Roughly' : 'About'} ${price.replace(', Recommended', '').replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                              : `Billed by ${provider.label}. You can destroy it any time.`}
                    </p>
                    <div className="flex items-center gap-2.5">
                        <Link
                            href={(devBox ? devBoxesIndex() : index()).url}
                            className={buttonClass('ghost')}
                        >
                            Cancel
                        </Link>
                        <Button
                            type="submit"
                            disabled={
                                form.processing ||
                                needsGcpLogin ||
                                form.data.stack_name.trim() === '' ||
                                (needsToken &&
                                    form.data.api_token.trim() === '') ||
                                (needsAwsKeys &&
                                    (form.data.aws_access_key_id.trim() ===
                                        '' ||
                                        form.data.aws_secret_access_key.trim() ===
                                            ''))
                            }
                        >
                            <Plus className="size-4" />
                            <span>
                                {form.processing
                                    ? 'Starting…'
                                    : devBox
                                      ? 'Create dev box'
                                      : 'Create server'}
                            </span>
                        </Button>
                    </div>
                </div>
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

function DnsAutomationOption({
    form,
    provider,
}: {
    form: ReturnType<typeof useForm<any>>;
    provider: Provider;
}) {
    const hasDns = form.data.dns_provider !== '';

    return (
        <details
            className="group rounded-xl bg-paper/60 ring-1 ring-line"
            open={hasDns || form.data.cloudflare_token !== ''}
        >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2.5">
                    <Globe className="size-4 shrink-0 text-servers" />
                    <span>
                        <span className="block text-[13px] font-medium text-ink">
                            Automate DNS & SSL (optional)
                        </span>
                        <span className="block text-xs text-soft">
                            ExternalDNS and Let's Encrypt DNS-01 wildcard SSL
                            via Cloudflare, Route 53, or Google Cloud DNS.
                        </span>
                    </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-soft transition group-open:rotate-180" />
            </summary>
            <div className="space-y-4 border-t border-line/60 px-4 py-3 text-xs leading-relaxed text-soft">
                <p>
                    Automate DNS records for every tool and application deployed
                    to this cluster, and issue Let's Encrypt SSL certificates
                    via DNS-01 challenge (even for proxied or wildcard domains).
                </p>

                <Field label="DNS & TLS Provider">
                    <Select
                        value={
                            form.data.dns_provider ||
                            (form.data.cloudflare_token ? 'cloudflare' : '')
                        }
                        onChange={(value) => {
                            form.setData('dns_provider', value);
                        }}
                        options={[
                            {
                                value: '',
                                label: 'None (Configure later or manually)',
                            },
                            { value: 'cloudflare', label: 'Cloudflare' },
                            { value: 'route53', label: 'AWS Route 53' },
                            { value: 'google', label: 'Google Cloud DNS' },
                        ]}
                    />
                </Field>

                {(form.data.dns_provider !== '' ||
                    form.data.cloudflare_token !== '') && (
                    <>
                        <div className="flex flex-col gap-2 rounded-lg bg-surface/40 p-2.5 ring-1 ring-line/50">
                            <label className="flex cursor-pointer items-center gap-2 text-ink">
                                <input
                                    type="checkbox"
                                    checked={form.data.enable_dns}
                                    onChange={(e) =>
                                        form.setData(
                                            'enable_dns',
                                            e.target.checked,
                                        )
                                    }
                                    className="rounded border-line text-servers focus:ring-servers"
                                />
                                <span>
                                    Automate app and tool DNS records
                                    (ExternalDNS)
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-ink">
                                <input
                                    type="checkbox"
                                    checked={form.data.enable_tls}
                                    onChange={(e) =>
                                        form.setData(
                                            'enable_tls',
                                            e.target.checked,
                                        )
                                    }
                                    className="rounded border-line text-servers focus:ring-servers"
                                />
                                <span>
                                    Enable Let's Encrypt DNS-01 challenge for
                                    SSL (wildcard/proxied hosts)
                                </span>
                            </label>
                        </div>

                        {(form.data.dns_provider === 'cloudflare' ||
                            (!form.data.dns_provider &&
                                form.data.cloudflare_token !== '')) && (
                            <div className="space-y-3">
                                <p className="text-xs text-soft">
                                    Create a token with the{' '}
                                    <strong>Edit zone DNS</strong> template
                                    covering your domains at{' '}
                                    <ExternalLinkButton
                                        url="https://dash.cloudflare.com/profile/api-tokens"
                                        showIcon
                                        className="inline-flex cursor-pointer items-center gap-1 font-medium text-servers hover:underline"
                                    >
                                        Cloudflare API Tokens
                                    </ExternalLinkButton>
                                    .
                                </p>
                                <Field
                                    label="Cloudflare API token"
                                    hint="Used for this run only. Never saved in plaintext."
                                    error={form.errors.cloudflare_token}
                                >
                                    <input
                                        type="password"
                                        value={form.data.cloudflare_token}
                                        onChange={(e) =>
                                            form.setData(
                                                'cloudflare_token',
                                                e.target.value,
                                            )
                                        }
                                        autoComplete="off"
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                            </div>
                        )}

                        {form.data.dns_provider === 'route53' && (
                            <div className="space-y-3">
                                {provider.slug === 'aws' && (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                form.setData(
                                                    'dns_aws_access_key_id',
                                                    form.data.aws_access_key_id,
                                                );
                                                form.setData(
                                                    'dns_aws_secret_access_key',
                                                    form.data
                                                        .aws_secret_access_key,
                                                );
                                                form.setData(
                                                    'dns_aws_region',
                                                    form.data.region ||
                                                        'us-east-1',
                                                );
                                            }}
                                            className="flex items-center gap-1 text-xs font-medium text-servers hover:underline"
                                        >
                                            <Key className="size-3" />
                                            <span>Copy server AWS keys</span>
                                        </button>
                                    </div>
                                )}
                                <AwsPolicyHelper
                                    includeEks={false}
                                    includeRoute53={true}
                                />
                                <Field
                                    label="AWS Access Key ID"
                                    error={form.errors.dns_aws_access_key_id}
                                >
                                    <input
                                        type="text"
                                        placeholder="AKIAIOSFODNN7EXAMPLE"
                                        value={form.data.dns_aws_access_key_id}
                                        onChange={(e) =>
                                            form.setData(
                                                'dns_aws_access_key_id',
                                                e.target.value,
                                            )
                                        }
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                                <Field
                                    label="AWS Secret Access Key"
                                    error={
                                        form.errors.dns_aws_secret_access_key
                                    }
                                >
                                    <input
                                        type="password"
                                        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                        value={
                                            form.data.dns_aws_secret_access_key
                                        }
                                        onChange={(e) =>
                                            form.setData(
                                                'dns_aws_secret_access_key',
                                                e.target.value,
                                            )
                                        }
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                                <Field
                                    label="AWS Region"
                                    error={form.errors.dns_aws_region}
                                >
                                    <input
                                        type="text"
                                        placeholder="us-east-1"
                                        value={form.data.dns_aws_region}
                                        onChange={(e) =>
                                            form.setData(
                                                'dns_aws_region',
                                                e.target.value,
                                            )
                                        }
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                            </div>
                        )}

                        {form.data.dns_provider === 'google' && (
                            <div className="space-y-3">
                                {provider.slug === 'gcp' && (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (form.data.project_id) {
                                                    form.setData(
                                                        'dns_gcp_project_id',
                                                        String(
                                                            form.data
                                                                .project_id,
                                                        ),
                                                    );
                                                }
                                            }}
                                            className="flex items-center gap-1 text-xs font-medium text-servers hover:underline"
                                        >
                                            <Key className="size-3" />
                                            <span>
                                                Use server GCP project ID
                                            </span>
                                        </button>
                                    </div>
                                )}
                                <Field
                                    label="Google Cloud Project ID"
                                    error={form.errors.dns_gcp_project_id}
                                >
                                    <input
                                        type="text"
                                        placeholder="my-gcp-project"
                                        value={form.data.dns_gcp_project_id}
                                        onChange={(e) =>
                                            form.setData(
                                                'dns_gcp_project_id',
                                                e.target.value,
                                            )
                                        }
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                                <Field
                                    label="Service Account Credentials (JSON or path)"
                                    hint="A Service Account key JSON string, or absolute path to a JSON file on this machine with roles/dns.admin."
                                    error={form.errors.dns_gcp_credentials}
                                >
                                    <textarea
                                        rows={3}
                                        placeholder='{"type": "service_account", ...} or /path/to/key.json'
                                        value={form.data.dns_gcp_credentials}
                                        onChange={(e) =>
                                            form.setData(
                                                'dns_gcp_credentials',
                                                e.target.value,
                                            )
                                        }
                                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                    />
                                </Field>
                            </div>
                        )}
                    </>
                )}
            </div>
        </details>
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
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-soft">
                {label}
            </span>
            {children}
            {error ? (
                <span className="text-bad mt-1 block text-xs">{error}</span>
            ) : (
                hint && (
                    <span className="mt-1 block text-xs text-soft">{hint}</span>
                )
            )}
        </label>
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
