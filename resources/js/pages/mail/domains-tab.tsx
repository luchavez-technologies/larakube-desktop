import { Form } from '@inertiajs/react';
import { useState } from 'react';
import {
    Plus,
    RotateCw,
    Globe,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Copy,
    Check,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { Server } from '@/types/larakube';

export type DomainRow = {
    id: string;
    name: string;
    accounts: number;
};

type Props = {
    server: Server;
    domains?: DomainRow[];
    serverHost?: string | null;
};

type CheckResult = {
    installed: boolean;
    domain?: string;
    host?: string;
    summary?: {
        pass: number;
        warn: number;
        fail: number;
    };
    checks?: Array<{
        status: string;
        label: string;
        hint: string;
    }>;
    error?: string;
};

export default function DomainsTab({
    server,
    domains = [],
    serverHost,
}: Props) {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newDomain, setNewDomain] = useState('');
    const [cfToken, setCfToken] = useState('');
    const [acmeEmail, setAcmeEmail] = useState('');

    const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
    const [checkResults, setCheckResults] = useState<
        Record<string, CheckResult>
    >({});
    const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copyToClipboard = (key: string, value: string) => {
        void navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const runDnsCheck = async (domainName: string) => {
        setVerifyingDomain(domainName);
        try {
            const res = await fetch(
                `/servers/${server.name}/mail/check-dns?domain=${encodeURIComponent(domainName)}`,
            );
            const data = (await res.json()) as CheckResult;
            setCheckResults((prev) => ({ ...prev, [domainName]: data }));
            setExpandedCheck(domainName);
        } catch {
            setCheckResults((prev) => ({
                ...prev,
                [domainName]: {
                    installed: false,
                    error: 'Network error checking DNS status.',
                },
            }));
            setExpandedCheck(domainName);
        } finally {
            setVerifyingDomain(null);
        }
    };

    const host = serverHost || `mail.${server.name}.test`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-medium text-ink">
                        Configured Domains
                    </h3>
                    <p className="mt-0.5 text-xs text-soft">
                        Manage domains, review required DNS records, and verify
                        live propagation.
                    </p>
                </div>

                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsAddOpen(true)}
                >
                    <Plus className="h-4 w-4" />
                    Add Domain
                </Button>
            </div>

            {domains.length === 0 ? (
                <Card className="py-12 text-center">
                    <Globe className="mx-auto mb-3 h-8 w-8 text-soft" />
                    <h4 className="text-sm font-medium text-ink">
                        No domains configured
                    </h4>
                    <p className="mt-1 text-xs text-soft">
                        Add a domain to start creating mailboxes and routing
                        messages.
                    </p>
                    <div className="mt-4">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setIsAddOpen(true)}
                        >
                            <Plus className="h-4 w-4" />
                            Add First Domain
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="space-y-6">
                    {domains.map((domain) => {
                        const check = checkResults[domain.name];
                        const isExpanded = expandedCheck === domain.name;
                        const isChecking = verifyingDomain === domain.name;

                        const dnsRecords = [
                            {
                                type: 'MX',
                                host: '@',
                                value: `10 ${host}`,
                                purpose: 'Inbound mail routing',
                            },
                            {
                                type: 'TXT',
                                host: '@',
                                value: 'v=spf1 mx ~all',
                                purpose: 'SPF sender verification',
                            },
                            {
                                type: 'TXT',
                                host: '_dmarc',
                                value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain.name}`,
                                purpose: 'DMARC alignment policy',
                            },
                            {
                                type: 'TXT',
                                host: 'stalwart._domainkey',
                                value: 'v=DKIM1; k=rsa; p=...',
                                purpose: 'DKIM cryptographic signature',
                            },
                        ];

                        return (
                            <Card key={domain.id} className="p-5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                                            <Globe className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-semibold text-ink">
                                                    {domain.name}
                                                </h4>
                                                <span className="rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft ring-1 ring-line">
                                                    {domain.accounts} mailbox
                                                    {domain.accounts === 1
                                                        ? ''
                                                        : 'es'}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-xs text-soft">
                                                DNS checklist & live
                                                reachability
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={isChecking}
                                            onClick={() =>
                                                runDnsCheck(domain.name)
                                            }
                                        >
                                            <RotateCw
                                                className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`}
                                            />
                                            {isChecking
                                                ? 'Verifying...'
                                                : 'Verify DNS'}
                                        </Button>

                                        {check && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    setExpandedCheck(
                                                        isExpanded
                                                            ? null
                                                            : domain.name,
                                                    )
                                                }
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4" />
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* DNS Verification Output Card if available */}
                                {check && isExpanded && (
                                    <div className="mt-4 rounded-xl border border-line bg-paper/60 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <h5 className="text-xs font-semibold text-ink">
                                                Verification Results for{' '}
                                                {domain.name}
                                            </h5>
                                            {check.summary && (
                                                <div className="flex items-center gap-2 text-[11px]">
                                                    <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        {check.summary.pass}{' '}
                                                        pass
                                                    </span>
                                                    {check.summary.warn > 0 && (
                                                        <span className="inline-flex items-center gap-1 font-medium text-amber-500">
                                                            <AlertTriangle className="h-3.5 w-3.5" />
                                                            {check.summary.warn}{' '}
                                                            warn
                                                        </span>
                                                    )}
                                                    {check.summary.fail > 0 && (
                                                        <span className="inline-flex items-center gap-1 font-medium text-red-500">
                                                            <XCircle className="h-3.5 w-3.5" />
                                                            {check.summary.fail}{' '}
                                                            fail
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {check.checks &&
                                        check.checks.length > 0 ? (
                                            <div className="divide-y divide-line/60">
                                                {check.checks.map((chk, i) => (
                                                    <div
                                                        key={i}
                                                        className="py-2 text-xs"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            {chk.status ===
                                                            'ok' ? (
                                                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                                            ) : chk.status ===
                                                              'warn' ? (
                                                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                                                            ) : (
                                                                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                                            )}
                                                            <div>
                                                                <span className="font-medium text-ink">
                                                                    {chk.label}
                                                                </span>
                                                                {chk.hint && (
                                                                    <p className="mt-0.5 text-[11px] text-soft">
                                                                        {
                                                                            chk.hint
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-soft">
                                                {check.error ||
                                                    'No check details returned.'}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Required DNS Records Table */}
                                <div className="mt-4">
                                    <div className="mb-2 text-[11px] font-medium tracking-wide text-soft uppercase">
                                        Required DNS Records (External DNS
                                        Provider)
                                    </div>
                                    <div className="overflow-x-auto rounded-xl border border-line bg-paper/30">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-line bg-paper/60 text-soft">
                                                    <th className="px-4 py-2.5 font-medium">
                                                        Type
                                                    </th>
                                                    <th className="px-4 py-2.5 font-medium">
                                                        Host / Name
                                                    </th>
                                                    <th className="px-4 py-2.5 font-medium">
                                                        Value / Target
                                                    </th>
                                                    <th className="px-4 py-2.5 font-medium">
                                                        Purpose
                                                    </th>
                                                    <th className="px-4 py-2.5 text-right font-medium">
                                                        Copy
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-line">
                                                {dnsRecords.map((rec) => {
                                                    const key = `${domain.name}-${rec.type}-${rec.host}`;
                                                    const isCopied =
                                                        copiedKey === key;

                                                    return (
                                                        <tr
                                                            key={key}
                                                            className="hover:bg-paper/40"
                                                        >
                                                            <td className="px-4 py-2.5">
                                                                <span className="rounded bg-line px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
                                                                    {rec.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 font-mono text-soft">
                                                                {rec.host}
                                                            </td>
                                                            <td className="max-w-xs truncate px-4 py-2.5 font-mono text-ink">
                                                                {rec.value}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-soft">
                                                                {rec.purpose}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        copyToClipboard(
                                                                            key,
                                                                            rec.value,
                                                                        )
                                                                    }
                                                                >
                                                                    {isCopied ? (
                                                                        <>
                                                                            <Check className="h-3 w-3 text-emerald-500" />
                                                                            Copied
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Copy className="h-3 w-3" />
                                                                            Copy
                                                                        </>
                                                                    )}
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add Domain Modal */}
            {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-ink">
                                Add Mail Domain
                            </h3>
                            <button
                                onClick={() => setIsAddOpen(false)}
                                className="text-soft transition hover:text-ink"
                            >
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="mb-4 text-xs text-soft">
                            Onboard an additional domain to host mailboxes on
                            this Stalwart server.
                        </p>

                        <Form
                            action={`/servers/${server.name}/mail/domains`}
                            method="post"
                            onSubmit={() => setIsAddOpen(false)}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    Domain Name
                                </label>
                                <input
                                    type="text"
                                    name="domain"
                                    required
                                    value={newDomain}
                                    onChange={(e) =>
                                        setNewDomain(e.target.value)
                                    }
                                    placeholder="acme.com"
                                    className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    Cloudflare API Token (Optional)
                                </label>
                                <input
                                    type="password"
                                    name="cloudflare_token"
                                    value={cfToken}
                                    onChange={(e) => setCfToken(e.target.value)}
                                    placeholder="Auto-configures DNS records if provided"
                                    className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-soft">
                                    ACME / Let's Encrypt Email (Optional)
                                </label>
                                <input
                                    type="email"
                                    name="acme_email"
                                    value={acmeEmail}
                                    onChange={(e) =>
                                        setAcmeEmail(e.target.value)
                                    }
                                    placeholder="admin@acme.com"
                                    className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-4">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setIsAddOpen(false)}
                                >
                                    <XCircle className="h-4 w-4" />
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                >
                                    <Plus className="h-4 w-4" />
                                    Add Domain
                                </Button>
                            </div>
                        </Form>
                    </div>
                </div>
            )}
        </div>
    );
}
