import { Form } from '@inertiajs/react';
import { useState } from 'react';
import {
    RotateCw,
    Trash2,
    Shield,
    Mail,
    Key,
    Copy,
    Check,
    AlertTriangle,
    Lock,
    Globe,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { DriveServerInfo, Server as ServerType } from '@/types/larakube';

type Props = {
    server: ServerType;
    info?: DriveServerInfo | null;
};

export default function SettingsTab({ server, info }: Props) {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [confirmPurge, setConfirmPurge] = useState(false);

    const copyValue = (key: string, val: string) => {
        void navigator.clipboard.writeText(val);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const host = info?.host || server.ip || `${server.name}.test`;
    const oidcCallback = `https://${host}/oidc-callback.html`;
    const oidcSilentRedirect = `https://${host}/oidc-silent-redirect.html`;

    const hasSso = Boolean(info?.sso?.installed);
    const hasSmtp = Boolean(info?.smtp?.installed);
    const hasVpn = Boolean(info?.vpn?.installed);

    return (
        <div className="space-y-6">
            {/* Cluster Integrations */}
            <Card label="Ecosystem & Cluster Integrations">
                <div className="grid gap-4 pt-2 text-xs sm:grid-cols-3">
                    {/* SSO */}
                    <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-4">
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <Key className="h-4 w-4 text-violet-500" />
                                <span className="font-semibold text-ink">
                                    Zitadel SSO (OIDC)
                                </span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-soft">
                                Single Sign-On user authentication &
                                organization space RBAC.
                            </p>
                        </div>
                        <div className="mt-4 border-t border-line/60 pt-3">
                            {hasSso ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                    <Check className="h-3.5 w-3.5" />
                                    Connected
                                </span>
                            ) : (
                                <span className="text-muted text-[11px]">
                                    Available via{' '}
                                    <code className="text-ink">sso:wire</code>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* SMTP */}
                    <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-4">
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <Mail className="h-4 w-4 text-emerald-500" />
                                <span className="font-semibold text-ink">
                                    Stalwart Mail (SMTP)
                                </span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-soft">
                                Transactional email notifications for shared
                                links & account invites.
                            </p>
                        </div>
                        <div className="mt-4 border-t border-line/60 pt-3">
                            {hasSmtp ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                    <Check className="h-3.5 w-3.5" />
                                    Configured
                                </span>
                            ) : (
                                <span className="text-muted text-[11px]">
                                    Available via{' '}
                                    <code className="text-ink">mail:wire</code>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* NetBird VPN */}
                    <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-4">
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <Shield className="h-4 w-4 text-sky-500" />
                                <span className="font-semibold text-ink">
                                    NetBird Mesh VPN
                                </span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-soft">
                                Traefik middleware restricting access
                                exclusively to your secure WireGuard overlay.
                            </p>
                        </div>
                        <div className="mt-4 border-t border-line/60 pt-3">
                            {hasVpn ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                                    <Lock className="h-3.5 w-3.5" />
                                    VPN Restricted
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-soft">
                                    <Globe className="h-3.5 w-3.5 text-soft" />
                                    Public Ingress (SSL)
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            {/* OIDC & WebDAV Endpoints */}
            <Card label="Integration & Redirect URIs">
                <div className="space-y-3 pt-2 text-xs">
                    <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 p-3">
                        <div>
                            <span className="font-semibold text-ink">
                                OIDC Callback URI
                            </span>
                            <p className="mt-0.5 font-mono break-all text-soft">
                                {oidcCallback}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                copyValue('oidcCallback', oidcCallback)
                            }
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                        >
                            {copiedKey === 'oidcCallback' ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                                <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>
                                {copiedKey === 'oidcCallback'
                                    ? 'Copied'
                                    : 'Copy'}
                            </span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 p-3">
                        <div>
                            <span className="font-semibold text-ink">
                                OIDC Silent Redirect URI
                            </span>
                            <p className="mt-0.5 font-mono break-all text-soft">
                                {oidcSilentRedirect}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                copyValue('oidcSilent', oidcSilentRedirect)
                            }
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-soft transition hover:bg-paper hover:text-ink"
                        >
                            {copiedKey === 'oidcSilent' ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                                <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>
                                {copiedKey === 'oidcSilent' ? 'Copied' : 'Copy'}
                            </span>
                        </button>
                    </div>
                </div>
            </Card>

            {/* Maintenance & Rollout Restart */}
            <Card label="Maintenance & Workload Operations">
                <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-ink">
                            Re-reconcile & Restart Deployment
                        </h4>
                        <p className="text-xs text-soft">
                            Triggers a rolling update to restart ownCloud
                            Infinite Scale and reload configuration secrets.
                        </p>
                    </div>

                    <Form
                        action={`/servers/${server.name}/drive/restart`}
                        method="post"
                    >
                        <Button type="submit" variant="secondary" size="sm">
                            <RotateCw className="h-4 w-4" />
                            Restart Drive
                        </Button>
                    </Form>
                </div>
            </Card>

            {/* Danger Zone */}
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 dark:border-rose-500/10 dark:bg-rose-500/5">
                <div className="flex items-start gap-3">
                    <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20">
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <h3 className="text-sm font-semibold text-ink">
                            Danger Zone: Teardown Drive Workload
                        </h3>
                        <p className="text-xs leading-relaxed text-soft">
                            Removing Drive deletes Deployments, Services, and
                            Ingresses in{' '}
                            <code className="text-ink">larakube-shared</code>.
                            <strong className="font-medium text-ink">
                                {' '}
                                Drive file data in your S3 bucket and encryption
                                keys in secrets are PRESERVED
                            </strong>{' '}
                            to prevent irreversible data loss.
                        </p>
                    </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 border-t border-rose-500/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-soft">
                        <input
                            type="checkbox"
                            checked={confirmPurge}
                            onChange={(e) => setConfirmPurge(e.target.checked)}
                            className="h-4 w-4 rounded border-line text-rose-500 focus:ring-rose-500"
                        />
                        <span>Also purge local volume allocation claims</span>
                    </label>

                    <Form
                        action={`/servers/${server.name}/drive`}
                        method="post"
                    >
                        <input type="hidden" name="_method" value="delete" />
                        {confirmPurge && (
                            <input type="hidden" name="purge" value="1" />
                        )}
                        <Button type="submit" variant="danger" size="sm">
                            <Trash2 className="h-4 w-4" />
                            Remove Drive from Cluster
                        </Button>
                    </Form>
                </div>
            </div>
        </div>
    );
}
