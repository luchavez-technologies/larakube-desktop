import { Deferred, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { store } from '@/routes/servers';
import type { Provider } from '@/types/larakube';

const tokenProviders = ['do', 'hetzner'];

export default function CreateServer({
    providers,
}: {
    providers?: Provider[] | null;
}) {
    return (
        <AppLayout title="Create a server">
            <p className="mb-8 max-w-2xl text-sm text-slate-600">
                Creates a single-node Kubernetes server (k3s) with your cloud
                provider. Provisioning usually takes a few minutes and is billed
                by your provider.
            </p>
            <Deferred
                data="providers"
                fallback={
                    <div className="h-64 max-w-3xl animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
                }
            >
                {providers ? (
                    <ServerForm providers={providers} />
                ) : (
                    <p className="text-sm text-slate-600">
                        The LaraKube CLI isn't ready yet. Finish Setup first.
                    </p>
                )}
            </Deferred>
        </AppLayout>
    );
}

function ServerForm({ providers }: { providers: Provider[] }) {
    const initial = providers[0];
    const form = useForm({
        provider: initial.slug,
        stack_name: 'my-first-server',
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
        <form onSubmit={submit} className="max-w-3xl space-y-6">
            <fieldset>
                <legend className="mb-3 text-sm font-medium">
                    Cloud provider
                </legend>
                <div className="grid grid-cols-2 gap-3">
                    {providers.map((candidate) => (
                        <button
                            key={candidate.slug}
                            type="button"
                            onClick={() => selectProvider(candidate)}
                            className={cn(
                                'flex items-center justify-between rounded-xl bg-white px-4 py-3 text-left ring-1 transition',
                                candidate.slug === provider.slug
                                    ? 'ring-2 ring-servers-500'
                                    : 'ring-slate-200 hover:ring-slate-300',
                            )}
                        >
                            <span className="text-sm font-medium">
                                {candidate.label}
                            </span>
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
                {blocked && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {provider.credentials.hint} Log in from Setup, then come
                        back.
                    </p>
                )}
            </fieldset>

            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <Field
                    label="Server name"
                    error={form.errors.stack_name}
                    className="col-span-2"
                >
                    <input
                        value={form.data.stack_name}
                        onChange={(event) =>
                            form.setData('stack_name', event.target.value)
                        }
                        className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-servers-500"
                    />
                </Field>
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
                {needsToken && (
                    <Field
                        label={`${provider.label} API token`}
                        error={form.errors.api_token}
                        className="col-span-2"
                    >
                        <input
                            type="password"
                            value={form.data.api_token}
                            onChange={(event) =>
                                form.setData('api_token', event.target.value)
                            }
                            placeholder="Used for this run only, never saved"
                            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-servers-500"
                        />
                    </Field>
                )}
            </div>

            <button
                type="submit"
                disabled={
                    form.processing ||
                    blocked ||
                    (needsToken && form.data.api_token.trim() === '')
                }
                className="rounded-lg bg-servers-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {form.processing ? 'Starting…' : 'Create server'}
            </button>
        </form>
    );
}

function Field({
    label,
    error,
    className,
    children,
}: {
    label: string;
    error?: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <label className={cn('block', className)}>
            <span className="mb-1.5 block text-xs font-medium text-slate-600">
                {label}
            </span>
            {children}
            {error && (
                <span className="mt-1 block text-xs text-setup-500">
                    {error}
                </span>
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
            className="w-full rounded-lg border-0 px-3 py-2 font-mono text-xs ring-1 ring-slate-200 focus:ring-2 focus:ring-servers-500"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
