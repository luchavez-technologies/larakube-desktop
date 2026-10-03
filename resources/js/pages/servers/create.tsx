import { Deferred, Link, router, useForm } from '@inertiajs/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, RefreshCw } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Button from '@/components/button';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { open } from '@/routes';
import { index, store } from '@/routes/servers';
import type { Provider } from '@/types/larakube';

const tokenProviders = ['do', 'hetzner'];

export default function CreateServer({
    providers,
    project,
}: {
    providers?: Provider[] | null;
    project: { id: number; name: string } | null;
}) {
    return (
        <AppLayout title="Create a server">
            <PageHeader
                title="Create a server"
                subtitle="A single-node Kubernetes server (k3s), hardened and ready for Cluster Tools. Takes about 5 minutes and is billed by your provider."
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
                {providers ? (
                    <ServerForm
                        providers={providers}
                        projectId={project?.id ?? null}
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
}: {
    providers: Provider[];
    projectId: number | null;
}) {
    const initial =
        providers.find((provider) => provider.credentials.ready) ??
        providers[0];
    const form = useForm({
        provider: initial.slug,
        stack_name: '',
        region: initial.defaultRegion,
        size: initial.defaultVpsSize,
        api_token: '',
        cloudflare_token: '',
        aws_access_key_id: '',
        aws_secret_access_key: '',
        project_id: projectId,
    });

    const [isGcpLoggingIn, setIsGcpLoggingIn] = useState(false);

    const provider =
        providers.find((candidate) => candidate.slug === form.data.provider) ??
        initial;

    const needsToken =
        tokenProviders.includes(provider.slug) && !provider.credentials.ready;
    const needsAwsKeys = provider.slug === 'aws' && !provider.credentials.ready;
    const needsGcpLogin =
        provider.slug === 'gcp' && !provider.credentials.ready;

    const size = provider.vpsSizes.find(
        (option) => option.value === form.data.size,
    );
    const price = size?.label.match(/\(([^)]*\/mo[^)]*)\)/)?.[1];

    function selectProvider(next: Provider) {
        form.setData({
            ...form.data,
            provider: next.slug,
            region: next.defaultRegion,
            size: next.defaultVpsSize,
            api_token: '',
            aws_access_key_id: '',
            aws_secret_access_key: '',
        });
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        form.post(store().url);
    }

    return (
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
                        <span className="text-sm font-medium">
                            {candidate.label}
                        </span>
                        <StatusPill
                            tone={candidate.credentials.ready ? 'ok' : 'muted'}
                        >
                            {candidate.credentials.ready
                                ? 'Ready'
                                : 'Not connected'}
                        </StatusPill>
                    </button>
                ))}
            </div>

            {needsGcpLogin && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-warn-tint px-4 py-3 text-sm text-warn">
                    <span>
                        {provider.credentials.hint} Authorize with Google to
                        continue.
                    </span>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            setIsGcpLoggingIn(true);
                            router.post(
                                '/setup/cloud/gcp/login',
                                {},
                                {
                                    onFinish: () => setIsGcpLoggingIn(false),
                                },
                            );
                        }}
                        disabled={isGcpLoggingIn}
                        className="shrink-0 gap-1.5"
                    >
                        {isGcpLoggingIn ? (
                            <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                            <ExternalLink className="size-3.5" />
                        )}
                        <span>Sign in with Google</span>
                    </Button>
                </div>
            )}

            <div className="mt-5 space-y-4 rounded-2xl bg-surface p-5.5 ring-1 ring-line ring-inset">
                <Field
                    label="Server name"
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

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Region" error={form.errors.region}>
                        <Select
                            value={form.data.region}
                            onChange={(value) => form.setData('region', value)}
                            options={provider.regions}
                        />
                    </Field>
                    <Field
                        label="Size"
                        error={form.errors.size}
                        hint={pricingNote(provider)}
                    >
                        <Select
                            value={form.data.size}
                            onChange={(value) => form.setData('size', value)}
                            options={provider.vpsSizes}
                        />
                    </Field>
                </div>

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
                                form.setData('api_token', event.target.value)
                            }
                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                        />
                    </Field>
                )}

                {needsAwsKeys && (
                    <div className="space-y-4 border-t border-line/60 pt-3">
                        <p className="text-xs text-soft">
                            Enter your AWS IAM credentials for this server
                            deployment.
                        </p>
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

                <CloudflareOption
                    value={form.data.cloudflare_token}
                    error={form.errors.cloudflare_token}
                    onChange={(value) =>
                        form.setData('cloudflare_token', value)
                    }
                />
            </div>

            <div className="mt-5 flex items-center justify-between gap-4">
                <p className="text-[13px] text-soft">
                    {price
                        ? `${provider.pricing?.source === 'builtin' ? 'Roughly' : 'About'} ${price.replace(', Recommended', '').replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
                        : `Billed by ${provider.label}. You can destroy it any time.`}
                </p>
                <div className="flex items-center gap-2.5">
                    <Link href={index().url} className={buttonClass('ghost')}>
                        Cancel
                    </Link>
                    <Button
                        type="submit"
                        disabled={
                            form.processing ||
                            needsGcpLogin ||
                            form.data.stack_name.trim() === '' ||
                            (needsToken && form.data.api_token.trim() === '') ||
                            (needsAwsKeys &&
                                (form.data.aws_access_key_id.trim() === '' ||
                                    form.data.aws_secret_access_key.trim() ===
                                        ''))
                        }
                    >
                        {form.processing ? 'Starting…' : 'Create server'}
                    </Button>
                </div>
            </div>
        </form>
    );
}

/** The optional Cloudflare step: what it gives, how to get a token, and that it can wait. */
/** Says where the sizes and prices come from, so a stale one is never passed off as current. */
function pricingNote(provider: Provider): string | undefined {
    const pricing = provider.pricing;

    if (!pricing) return undefined;

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

function CloudflareOption({
    value,
    error,
    onChange,
}: {
    value: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <details
            className="group rounded-xl bg-paper/60 ring-1 ring-line"
            open={value !== ''}
        >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span>
                    <span className="block text-[13px] font-medium text-ink">
                        Connect Cloudflare now (optional)
                    </span>
                    <span className="block text-xs text-soft">
                        Domains and HTTPS set up for you. You can skip this and
                        do it later.
                    </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-soft transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-line/60 px-4 py-3 text-xs leading-relaxed text-soft">
                <p>
                    With a Cloudflare token, every tool you install gets its
                    address (DNS record) created automatically, and certificates
                    keep renewing even when Cloudflare proxies your site.
                    Without one, the server still works: you point your
                    domain&apos;s DNS at it yourself, and HTTPS uses Let&apos;s
                    Encrypt over plain HTTP.
                </p>
                <ol className="list-decimal space-y-1 pl-4">
                    <li>
                        Open{' '}
                        <Link
                            href={open().url}
                            method="post"
                            data={{
                                url: 'https://dash.cloudflare.com/profile/api-tokens',
                            }}
                            as="button"
                            className="font-medium text-servers hover:underline"
                        >
                            Cloudflare &rarr; My Profile &rarr; API Tokens
                        </Link>{' '}
                        and choose <strong>Create Token</strong>.
                    </li>
                    <li>
                        Use the <strong>Edit zone DNS</strong> template, and
                        under Zone Resources pick your domain (or all zones).
                    </li>
                    <li>Create it, copy the token, and paste it below.</li>
                </ol>
                <Field
                    label="Cloudflare API token"
                    hint="Used once and never saved in this app. If you don't have one yet, leave it empty: Connect a domain on the server's page does the same later."
                    error={error}
                >
                    <input
                        type="password"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        autoComplete="off"
                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                    />
                </Field>
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
    label: string;
    hint?: string;
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
}: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
