import {
    type ChangeEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
} from 'react';
import {
    AlertCircle,
    CheckCircle2,
    FlaskConical,
    Key,
    RotateCw,
    Server,
    ShieldCheck,
    Upload,
} from 'lucide-react';
import { usePage } from '@inertiajs/react';
import AwsPolicyHelper from '@/components/aws-policy-helper';
import GcpPolicyHelper from '@/components/gcp-policy-helper';
import SelectMenu, { type SelectMenuOption } from '@/components/select-menu';
import ExperimentalBadge from '@/components/experimental-badge';
import ProviderLogo from '@/components/provider-logo';
import { buttonClass } from '@/components/button';
import { sendJson } from '@/lib/http';
import { ExternalLinkButton } from '@/lib/open-external';
import { cn } from '@/lib/utils';
import type { Untested } from '@/types/larakube';

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

export function getDnsProviderOptions(untested?: Untested): SelectMenuOption[] {
    return [
        {
            value: 'cloudflare',
            label: 'Cloudflare',
            icon: <ProviderLogo provider="cloudflare" size="xs" />,
            badge: (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                    Recommended
                </span>
            ),
        },
        {
            value: 'route53',
            label: 'AWS Route 53',
            icon: <ProviderLogo provider="aws" size="xs" />,
            badge: untested?.dns_providers?.includes('route53') ? (
                <ExperimentalBadge />
            ) : undefined,
        },
        {
            value: 'google',
            label: 'Google Cloud DNS',
            icon: <ProviderLogo provider="gcp" size="xs" />,
            badge: untested?.dns_providers?.includes('google') ? (
                <ExperimentalBadge />
            ) : undefined,
        },
    ];
}

export const dnsProviderOptions = [
    { value: 'cloudflare', label: 'Cloudflare' },
    { value: 'route53', label: 'AWS Route 53' },
    { value: 'google', label: 'Google Cloud DNS' },
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
    onCloudflareVerified?: (valid: boolean | null) => void;
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
                <span className="mt-1 block text-xs text-accent">{error}</span>
            ) : (
                hint && (
                    <span className="mt-1 block text-xs text-soft">{hint}</span>
                )
            )}
        </div>
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
    onCloudflareVerified,
}: DnsTlsFieldsProps) {
    const { untested } = usePage<{ untested?: Untested }>().props;

    const activeProvider =
        lockedProvider ||
        values.dns_provider ||
        (values.cloudflare_token ? 'cloudflare' : '');

    const [verifying, setVerifying] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<{
        valid: boolean;
        error?: string;
        warning?: string;
        zones?: string[];
    } | null>(null);

    const handleVerify = useCallback(
        async (tokenToVerify?: string) => {
            const token = (tokenToVerify ?? values.cloudflare_token).trim();
            if (!token) {
                setVerificationStatus(null);
                onCloudflareVerified?.(null);
                return;
            }

            setVerifying(true);
            try {
                const { ok, data } = await sendJson<{
                    valid: boolean;
                    error?: string;
                    warning?: string;
                    zones?: string[];
                }>('/cloudflare/verify-token', 'POST', { token });

                if (ok && data.valid) {
                    setVerificationStatus({
                        valid: true,
                        warning: data.warning,
                        zones: data.zones ?? [],
                    });
                    onCloudflareVerified?.(true);
                } else {
                    setVerificationStatus({
                        valid: false,
                        error:
                            data.error ||
                            data.message ||
                            'Cloudflare API token verification failed.',
                        zones: data.zones,
                    });
                    onCloudflareVerified?.(false);
                }
            } catch {
                setVerificationStatus({
                    valid: false,
                    error: 'Could not connect to Cloudflare API. Please check your network connection.',
                });
                onCloudflareVerified?.(false);
            } finally {
                setVerifying(false);
            }
        },
        [values.cloudflare_token, onCloudflareVerified],
    );

    // Auto-verify on paste/typing when token looks complete (Cloudflare tokens are 40 chars)
    useEffect(() => {
        const token = values.cloudflare_token.trim();
        if (token.length < 35) {
            setVerificationStatus(null);
            onCloudflareVerified?.(null);
            return;
        }

        const timer = setTimeout(() => {
            void handleVerify(token);
        }, 600);

        return () => clearTimeout(timer);
    }, [values.cloudflare_token, handleVerify, onCloudflareVerified]);

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

    const baseOptions = getDnsProviderOptions(untested);
    const options: SelectMenuOption[] = allowEmptyProvider
        ? [
              {
                  value: '',
                  label: 'None (Configure later or manually)',
                  icon: (
                      <span className="inline-flex size-5 items-center justify-center rounded-md border border-line bg-surface text-soft shadow-2xs">
                          <Server className="size-3.5" />
                      </span>
                  ),
              },
              ...baseOptions,
          ]
        : baseOptions;

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
                        <div className="flex items-center gap-2">
                            <ProviderLogo
                                provider={
                                    lockedProvider === 'route53'
                                        ? 'aws'
                                        : lockedProvider === 'google'
                                          ? 'gcp'
                                          : 'cloudflare'
                                }
                                size="xs"
                            />
                            <span className="font-medium text-ink">
                                {dnsProviderLabel(lockedProvider)}
                            </span>
                            {untested?.dns_providers?.includes(
                                lockedProvider,
                            ) && <ExperimentalBadge />}
                        </div>
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
                            <div className="space-y-2.5 rounded-xl border border-line bg-surface/80 p-3.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Key className="size-4 shrink-0 text-servers" />
                                        <span className="text-xs font-semibold text-ink">
                                            Required Cloudflare Token
                                            Permissions
                                        </span>
                                    </div>
                                    <ExternalLinkButton
                                        url="https://dash.cloudflare.com/profile/api-tokens"
                                        showIcon
                                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-servers hover:underline"
                                    >
                                        Cloudflare API Tokens
                                    </ExternalLinkButton>
                                </div>

                                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                    <div className="flex items-start gap-2 rounded-lg bg-paper/90 p-2.5 ring-1 ring-line/60">
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                                        <div>
                                            <span className="font-semibold text-ink">
                                                1. Zone → DNS → Edit
                                            </span>
                                            <p className="mt-0.5 text-[11px] leading-relaxed text-soft">
                                                (From <em>Edit zone DNS</em>{' '}
                                                template) — lets ExternalDNS
                                                create and manage records.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 rounded-lg bg-paper/90 p-2.5 ring-1 ring-line/60">
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                                        <div>
                                            <span className="font-semibold text-ink">
                                                2. Zone → Zone Settings → Read
                                            </span>
                                            <p className="mt-0.5 text-[11px] leading-relaxed text-soft">
                                                <strong>
                                                    Must add manually
                                                </strong>{' '}
                                                via <em>+ Add more</em> — lets
                                                LaraKube verify SSL/TLS mode.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg bg-paper/60 px-3 py-1.5 text-[11px] text-soft ring-1 ring-line/40">
                                    <span className="font-semibold text-ink">
                                        Zone Resources:
                                    </span>{' '}
                                    Set to <strong>Include → All zones</strong>{' '}
                                    (or your specific domain).
                                </div>
                            </div>

                            <Field
                                label={
                                    <div className="flex w-full items-center justify-between">
                                        <span>Cloudflare API token</span>
                                        {values.cloudflare_token.trim() && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void handleVerify()
                                                }
                                                disabled={verifying}
                                                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-servers hover:underline disabled:opacity-50"
                                            >
                                                {verifying ? (
                                                    <>
                                                        <RotateCw className="size-3 animate-spin" />
                                                        <span>Verifying…</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <ShieldCheck className="size-3" />
                                                        <span>
                                                            Verify token
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                }
                                hint="Used for this run only. Stored securely on your cluster."
                                error={errors.cloudflare_token}
                            >
                                <input
                                    type="password"
                                    name="cloudflare_token"
                                    value={values.cloudflare_token}
                                    onChange={(e) => {
                                        onChange(
                                            'cloudflare_token',
                                            e.target.value,
                                        );
                                        setVerificationStatus(null);
                                    }}
                                    autoComplete="off"
                                    placeholder="Paste your Cloudflare API token"
                                    className={cn(
                                        'w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers',
                                        verificationStatus?.valid === true &&
                                            'ring-ok focus:ring-ok',
                                        verificationStatus?.valid === false &&
                                            'ring-accent focus:ring-accent',
                                    )}
                                />
                            </Field>

                            {verifying && (
                                <div className="flex items-center gap-2 rounded-lg bg-paper p-2.5 text-xs text-soft ring-1 ring-line">
                                    <RotateCw className="size-3.5 shrink-0 animate-spin text-servers" />
                                    <span>
                                        Verifying permissions with Cloudflare
                                        API…
                                    </span>
                                </div>
                            )}

                            {verificationStatus?.valid === true && (
                                <div className="space-y-1 rounded-lg border border-ok/30 bg-ok-tint/20 p-3 text-xs text-ok">
                                    <div className="flex items-center gap-2 font-semibold">
                                        <CheckCircle2 className="size-4 shrink-0 text-ok" />
                                        <span>
                                            Cloudflare API token verified &amp;
                                            active!
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-soft">
                                        Confirmed{' '}
                                        <strong>Zone → DNS → Edit</strong> and{' '}
                                        <strong>
                                            Zone → Zone Settings → Read
                                        </strong>{' '}
                                        permissions.
                                    </p>
                                    {verificationStatus.zones &&
                                        verificationStatus.zones.length > 0 && (
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-ok/20 pt-1.5">
                                                <span className="text-[10px] font-medium text-soft">
                                                    Accessible zones:
                                                </span>
                                                {verificationStatus.zones.map(
                                                    (zone) => (
                                                        <span
                                                            key={zone}
                                                            className="rounded bg-ok-tint px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ok ring-1 ring-ok/30"
                                                        >
                                                            {zone}
                                                        </span>
                                                    ),
                                                )}
                                            </div>
                                        )}
                                    {verificationStatus.warning && (
                                        <p className="mt-1 text-[11px] font-medium text-amber-500">
                                            ⚠️ {verificationStatus.warning}
                                        </p>
                                    )}
                                </div>
                            )}

                            {verificationStatus?.valid === false && (
                                <div className="space-y-1.5 rounded-lg border border-accent/40 bg-accent-tint/30 p-3 text-xs">
                                    <div className="flex items-start gap-2 font-semibold text-accent">
                                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                        <span>{verificationStatus.error}</span>
                                    </div>
                                    <p className="text-[11px] text-soft">
                                        ExternalDNS and automatic TLS require
                                        both <strong>Zone → DNS → Edit</strong>{' '}
                                        and{' '}
                                        <strong>
                                            Zone → Zone Settings → Read
                                        </strong>
                                        . Update your token permissions in{' '}
                                        <ExternalLinkButton
                                            url="https://dash.cloudflare.com/profile/api-tokens"
                                            showIcon
                                            className="inline-flex cursor-pointer items-center gap-1 font-medium text-servers hover:underline"
                                        >
                                            Cloudflare API Tokens
                                        </ExternalLinkButton>
                                        .
                                    </p>
                                </div>
                            )}
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
