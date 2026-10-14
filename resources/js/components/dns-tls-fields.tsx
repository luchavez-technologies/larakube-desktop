import { type ChangeEvent, type ReactNode } from 'react';
import { CheckCircle2, FlaskConical, Key, Upload } from 'lucide-react';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import GcpPolicyHelper from '@/components/gcp-policy-helper';
import SelectMenu from '@/components/select-menu';
import { buttonClass } from '@/components/button';
import { ExternalLinkButton } from '@/lib/open-external';
import { cn } from '@/lib/utils';

export type DnsTlsProvider = 'cloudflare' | 'route53' | 'google' | '';

export interface DnsTlsValues {
    dns_provider: DnsTlsProvider;
    enable_dns: boolean;
    enable_tls: boolean;
    cloudflare_token: string;
    dns_aws_access_key_id: string;
    dns_aws_secret_access_key: string;
    dns_aws_region: string;
    dns_gcp_project_id: string;
    dns_gcp_credentials: string;
    group?: string;
}

export function dnsProviderLabel(provider?: string): string {
    switch (provider) {
        case 'route53':
            return 'AWS Route 53';
        case 'google':
            return 'Google Cloud DNS';
        case 'cloudflare':
            return 'Cloudflare';
        default:
            return 'None';
    }
}

export const dnsProviderOptions = [
    { value: 'cloudflare', label: 'Cloudflare (Recommended)' },
    { value: 'route53', label: 'AWS Route 53 (Experimental)' },
    { value: 'google', label: 'Google Cloud DNS (Experimental)' },
];

export interface DnsTlsFieldsProps {
    values: DnsTlsValues;
    onChange: <K extends keyof DnsTlsValues>(
        field: K,
        value: DnsTlsValues[K],
    ) => void;
    errors?: Record<string, string | undefined>;
    serverProvider?: string;
    serverRegion?: string | null;
    allowEmptyProvider?: boolean;
    lockedProvider?: DnsTlsProvider;
    showToggles?: boolean;
    showGroupField?: boolean;
    copyAwsKeys?: () => void;
    copyGcpProjectId?: () => void;
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
                <span className="mt-1 block text-xs text-accent">{error}</span>
            ) : (
                hint && (
                    <span className="mt-1 block text-xs text-soft">{hint}</span>
                )
            )}
        </label>
    );
}

export default function DnsTlsFields({
    values,
    onChange,
    errors = {},
    serverProvider,
    allowEmptyProvider = false,
    lockedProvider,
    showToggles = true,
    showGroupField = false,
    copyAwsKeys,
    copyGcpProjectId,
}: DnsTlsFieldsProps) {
    const activeProvider =
        lockedProvider ||
        values.dns_provider ||
        (values.cloudflare_token ? 'cloudflare' : '');

    const handleGcpFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            onChange('dns_gcp_credentials', text.trim());
            try {
                const parsed = JSON.parse(text.trim());
                if (
                    parsed.project_id &&
                    (!values.dns_gcp_project_id ||
                        values.dns_gcp_project_id === '')
                ) {
                    onChange('dns_gcp_project_id', parsed.project_id);
                }
            } catch {
                // ignore invalid json
            }
        } catch {
            // ignore file read error
        }
    };

    const options = allowEmptyProvider
        ? [
              { value: '', label: 'None (Configure later or manually)' },
              ...dnsProviderOptions,
          ]
        : dnsProviderOptions;

    return (
        <div className="space-y-4">
            <Field label="DNS & TLS Provider">
                <input
                    type="hidden"
                    name="dns_provider"
                    value={activeProvider}
                />
                {lockedProvider ? (
                    <div className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-xs">
                        <span className="font-medium text-ink">
                            {dnsProviderLabel(lockedProvider)}
                        </span>
                        <span className="text-soft">Locked to cluster DNS</span>
                    </div>
                ) : (
                    <SelectMenu
                        value={activeProvider}
                        onChange={(value) => {
                            onChange('dns_provider', value as DnsTlsProvider);
                        }}
                        accent="servers"
                        options={options}
                    />
                )}
            </Field>

            {lockedProvider && (
                <p className="rounded-lg bg-surface p-2.5 text-xs text-soft ring-1 ring-line/50">
                    ExternalDNS is active on this cluster using{' '}
                    <strong>{dnsProviderLabel(lockedProvider)}</strong>. Because
                    domains rely on authoritative nameservers, automatic SSL
                    renewal must use the same provider to verify domain
                    ownership.
                </p>
            )}

            {activeProvider !== '' && (
                <div className="space-y-4 border-t border-line/60 pt-4">
                    {showToggles && (
                        <div className="flex flex-col gap-2 rounded-lg bg-surface/40 p-2.5 ring-1 ring-line/50">
                            <input
                                type="hidden"
                                name="enable_dns"
                                value={values.enable_dns ? '1' : '0'}
                            />
                            <input
                                type="hidden"
                                name="enable_tls"
                                value={values.enable_tls ? '1' : '0'}
                            />
                            <label className="flex cursor-pointer items-center gap-2 text-ink">
                                <input
                                    type="checkbox"
                                    checked={values.enable_dns}
                                    onChange={(e) =>
                                        onChange('enable_dns', e.target.checked)
                                    }
                                    className="rounded border-line text-servers focus:ring-servers"
                                />
                                <span className="text-xs">
                                    Automate app and tool DNS records
                                    (ExternalDNS)
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-ink">
                                <input
                                    type="checkbox"
                                    checked={values.enable_tls}
                                    onChange={(e) =>
                                        onChange('enable_tls', e.target.checked)
                                    }
                                    className="rounded border-line text-servers focus:ring-servers"
                                />
                                <span className="text-xs">
                                    Enable Let's Encrypt DNS-01 challenge for
                                    SSL (wildcard/proxied hosts)
                                </span>
                            </label>
                        </div>
                    )}

                    {activeProvider === 'cloudflare' && (
                        <div className="space-y-3">
                            <p className="text-xs text-soft">
                                Create a token with the{' '}
                                <strong>Edit zone DNS</strong> template covering
                                your domains at{' '}
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
                                hint="Used for this run only. Stored securely on your cluster."
                                error={errors.cloudflare_token}
                            >
                                <input
                                    type="password"
                                    name="cloudflare_token"
                                    value={values.cloudflare_token}
                                    onChange={(e) =>
                                        onChange(
                                            'cloudflare_token',
                                            e.target.value,
                                        )
                                    }
                                    autoComplete="off"
                                    placeholder="Paste your Cloudflare API token"
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                            </Field>
                        </div>
                    )}

                    {activeProvider === 'route53' && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                                <div className="flex items-center gap-1.5 font-semibold">
                                    <FlaskConical className="size-3.5 shrink-0" />
                                    <span>Experimental Provider</span>
                                </div>
                                <p className="mt-1 leading-relaxed text-soft">
                                    AWS Route 53 integration is supported via
                                    ExternalDNS &amp; cert-manager. Ensure your
                                    AWS IAM credentials have{' '}
                                    <code className="text-foreground font-mono">
                                        route53:ChangeResourceRecordSets
                                    </code>
                                    ,{' '}
                                    <code className="text-foreground font-mono">
                                        route53:ListResourceRecordSets
                                    </code>
                                    , and{' '}
                                    <code className="text-foreground font-mono">
                                        route53:ListHostedZonesByName
                                    </code>{' '}
                                    permissions.
                                </p>
                            </div>

                            {copyAwsKeys && serverProvider === 'aws' && (
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={copyAwsKeys}
                                        className="flex items-center gap-1 text-xs font-medium text-servers hover:underline"
                                    >
                                        <Key className="size-3" />
                                        <span>Copy server AWS keys</span>
                                    </button>
                                </div>
                            )}

                            <AwsPolicyHelper
                                includeEc2={false}
                                includeEks={false}
                                includeRoute53={true}
                                interactive={false}
                            />

                            <Field
                                label="AWS Access Key ID"
                                error={
                                    errors.dns_aws_access_key_id ??
                                    errors.aws_access_key_id
                                }
                            >
                                <input
                                    type="text"
                                    name="aws_access_key_id"
                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                    value={values.dns_aws_access_key_id}
                                    onChange={(e) =>
                                        onChange(
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
                                    errors.dns_aws_secret_access_key ??
                                    errors.aws_secret_access_key
                                }
                            >
                                <input
                                    type="password"
                                    name="aws_secret_access_key"
                                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                    value={values.dns_aws_secret_access_key}
                                    onChange={(e) =>
                                        onChange(
                                            'dns_aws_secret_access_key',
                                            e.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                            </Field>

                            <Field
                                label="AWS Region"
                                error={
                                    errors.dns_aws_region ?? errors.aws_region
                                }
                            >
                                <input
                                    type="text"
                                    name="aws_region"
                                    placeholder="us-east-1"
                                    value={values.dns_aws_region}
                                    onChange={(e) =>
                                        onChange(
                                            'dns_aws_region',
                                            e.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                            </Field>
                        </div>
                    )}

                    {activeProvider === 'google' && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                                <div className="flex items-center gap-1.5 font-semibold">
                                    <FlaskConical className="size-3.5 shrink-0" />
                                    <span>Experimental Provider</span>
                                </div>
                                <p className="mt-1 leading-relaxed text-soft">
                                    Google Cloud DNS automation is supported via
                                    ExternalDNS &amp; cert-manager. Ensure your
                                    GCP project has the{' '}
                                    <strong>Cloud DNS API</strong> enabled and
                                    the Service Account possesses the{' '}
                                    <code className="text-foreground font-mono">
                                        roles/dns.admin
                                    </code>{' '}
                                    IAM role.
                                </p>
                            </div>

                            <GcpPolicyHelper
                                includeCompute={false}
                                includeGke={false}
                                includeDns={true}
                                interactive={false}
                                projectId={
                                    values.dns_gcp_project_id || undefined
                                }
                            />

                            {copyGcpProjectId && serverProvider === 'gcp' && (
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={copyGcpProjectId}
                                        className="flex items-center gap-1 text-xs font-medium text-servers hover:underline"
                                    >
                                        <Key className="size-3" />
                                        <span>Use server GCP project ID</span>
                                    </button>
                                </div>
                            )}

                            <Field
                                label="Google Cloud Project ID"
                                error={
                                    errors.dns_gcp_project_id ??
                                    errors.gcp_project_id
                                }
                            >
                                <input
                                    type="text"
                                    name="gcp_project_id"
                                    placeholder="my-gcp-project"
                                    value={values.dns_gcp_project_id}
                                    onChange={(e) =>
                                        onChange(
                                            'dns_gcp_project_id',
                                            e.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                            </Field>

                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <div>
                                        <span className="block text-xs font-medium text-soft">
                                            Service Account Credentials (JSON or
                                            path)
                                        </span>
                                        <p className="mt-0.5 text-[11px] text-soft">
                                            Key JSON string, or absolute path on
                                            this machine with roles/dns.admin.
                                        </p>
                                    </div>
                                    <label
                                        className={cn(
                                            buttonClass('secondary', 'sm'),
                                            'cursor-pointer text-xs',
                                        )}
                                    >
                                        <Upload className="size-3" />
                                        <span>Browse JSON File…</span>
                                        <input
                                            type="file"
                                            accept=".json,application/json"
                                            onChange={handleGcpFileSelect}
                                            className="sr-only"
                                        />
                                    </label>
                                </div>
                                <textarea
                                    rows={3}
                                    name="gcp_credentials"
                                    placeholder='{"type": "service_account", ...} or /path/to/key.json'
                                    value={values.dns_gcp_credentials}
                                    onChange={(e) =>
                                        onChange(
                                            'dns_gcp_credentials',
                                            e.target.value,
                                        )
                                    }
                                    className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                />
                                {(errors.dns_gcp_credentials ??
                                    errors.gcp_credentials) && (
                                    <span className="mt-1 block text-xs text-accent">
                                        {errors.dns_gcp_credentials ??
                                            errors.gcp_credentials}
                                    </span>
                                )}

                                {(() => {
                                    try {
                                        const parsed = JSON.parse(
                                            values.dns_gcp_credentials.trim(),
                                        );
                                        if (
                                            parsed.client_email ||
                                            parsed.project_id
                                        ) {
                                            return (
                                                <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                                    <CheckCircle2 className="size-4 shrink-0" />
                                                    <div>
                                                        <span className="font-semibold">
                                                            Detected Service
                                                            Account:
                                                        </span>{' '}
                                                        <span className="font-mono">
                                                            {
                                                                parsed.client_email
                                                            }
                                                        </span>
                                                        {parsed.project_id && (
                                                            <span className="text-soft">
                                                                {' '}
                                                                (Project:{' '}
                                                                <code className="text-foreground font-mono">
                                                                    {
                                                                        parsed.project_id
                                                                    }
                                                                </code>
                                                                )
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }
                                    } catch {
                                        // ignore
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>
                    )}

                    {showGroupField && (
                        <Field
                            label="Group name (optional)"
                            hint={
                                errors.group ??
                                'Only needed when this instance manages a specific domain subset or multiple accounts.'
                            }
                            error={errors.group}
                        >
                            <input
                                name="group"
                                placeholder="e.g. company-domains"
                                value={values.group ?? ''}
                                onChange={(e) =>
                                    onChange('group', e.target.value)
                                }
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-servers"
                            />
                        </Field>
                    )}
                </div>
            )}
        </div>
    );
}
