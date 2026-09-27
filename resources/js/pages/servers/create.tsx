import { Deferred, Link, useForm } from '@inertiajs/react';
import type { FormEvent, ReactNode } from 'react';
import { buttonClass } from '@/components/button';
import Button from '@/components/button';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { index, store } from '@/routes/servers';
import type { Provider } from '@/types/larakube';

const tokenProviders = ['do', 'hetzner'];

export default function CreateServer({
    providers,
}: {
    providers?: Provider[] | null;
}) {
    return (
        <AppLayout title="Create a server">
            <PageHeader
                title="Create a server"
                subtitle="A single-node Kubernetes server (k3s), hardened and ready for Cluster Tools. Takes about 5 minutes and is billed by your provider."
            />
            <Deferred
                data="providers"
                fallback={
                    <div className="h-72 max-w-3xl animate-pulse rounded-2xl bg-surface ring-1 ring-line" />
                }
            >
                {providers ? (
                    <ServerForm providers={providers} />
                ) : (
                    <p className="text-sm text-soft">
                        The LaraKube CLI isn't ready yet. Finish Setup first.
                    </p>
                )}
            </Deferred>
        </AppLayout>
    );
}

function ServerForm({ providers }: { providers: Provider[] }) {
    const initial =
        providers.find((provider) => provider.credentials.ready) ??
        providers[0];
    const form = useForm({
        provider: initial.slug,
        stack_name: '',
        region: initial.defaultRegion,
        size: initial.defaultVpsSize,
        api_token: '',
    });

    const provider =
        providers.find((candidate) => candidate.slug === form.data.provider) ??
        initial;
    const needsToken =
        tokenProviders.includes(provider.slug) && !provider.credentials.ready;
    const blocked =
        !tokenProviders.includes(provider.slug) && !provider.credentials.ready;
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
            {blocked && (
                <p className="mt-3 rounded-lg bg-warn-tint px-3 py-2 text-sm text-warn">
                    {provider.credentials.hint} Log in from Setup, then come
                    back.
                </p>
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
                    <Field label="Size" error={form.errors.size}>
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
            </div>

            <div className="mt-5 flex items-center justify-between gap-4">
                <p className="text-[13px] text-soft">
                    {price
                        ? `About ${price.replace(', Recommended', '').replace('~', '')}, billed by ${provider.label}. You can destroy it any time.`
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
                            blocked ||
                            form.data.stack_name.trim() === '' ||
                            (needsToken && form.data.api_token.trim() === '')
                        }
                    >
                        {form.processing ? 'Starting…' : 'Create server'}
                    </Button>
                </div>
            </div>
        </form>
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
                <span className="mt-1 block text-xs text-accent">{error}</span>
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
            className="w-full rounded-lg border-0 bg-surface px-3 py-2 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
