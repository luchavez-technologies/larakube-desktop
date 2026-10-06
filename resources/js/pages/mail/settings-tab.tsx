import { useState } from 'react';
import {
    ExternalLink,
    Copy,
    Check,
    Eye,
    EyeOff,
    Server,
    Terminal,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import Card from '@/components/card';
import type { Server as ServerType } from '@/types/larakube';

export type ServerInfo = {
    installed: boolean;
    host?: string | null;
    adminUrl?: string | null;
    adminLogin?: string;
    adminPassword?: string | null;
    webmailUrl?: string | null;
    imap?: { host: string; port: number; tls: boolean } | null;
    smtp?: { host: string; port: number; tls: boolean } | null;
    queue?: number;
};

type Props = {
    server: ServerType;
    info?: ServerInfo | null;
};

export default function SettingsTab({ server, info }: Props) {
    const [showPassword, setShowPassword] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copyValue = (key: string, val: string) => {
        void navigator.clipboard.writeText(val);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const host = info?.host || server.ip || `${server.name}.test`;

    const envSnippet = `MAIL_MAILER=smtp
MAIL_HOST=${host}
MAIL_PORT=465
MAIL_USERNAME=your-account@yourdomain.com
MAIL_PASSWORD=your-account-password
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS="your-account@yourdomain.com"
MAIL_FROM_NAME="\${APP_NAME}"`;

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Client Connection Settings */}
                <Card label="Mail Client Connection Settings (IMAP / SMTP)">
                    <div className="space-y-4 pt-2 text-xs">
                        <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 p-3">
                            <div>
                                <span className="font-semibold text-ink">
                                    IMAP (Incoming)
                                </span>
                                <p className="mt-0.5 text-soft">
                                    Host:{' '}
                                    <span className="font-mono text-ink">
                                        {host}
                                    </span>{' '}
                                    · Port{' '}
                                    <span className="font-mono font-bold text-ink">
                                        993
                                    </span>{' '}
                                    (SSL/TLS)
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyValue('imap', `${host}:993`)}
                            >
                                {copiedKey === 'imap' ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 p-3">
                            <div>
                                <span className="font-semibold text-ink">
                                    SMTP (Outgoing)
                                </span>
                                <p className="mt-0.5 text-soft">
                                    Host:{' '}
                                    <span className="font-mono text-ink">
                                        {host}
                                    </span>{' '}
                                    · Port{' '}
                                    <span className="font-mono font-bold text-ink">
                                        465
                                    </span>{' '}
                                    (SSL/TLS)
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyValue('smtp', `${host}:465`)}
                            >
                                {copiedKey === 'smtp' ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-line bg-paper/50 p-3">
                            <div>
                                <span className="font-semibold text-ink">
                                    SMTP STARTTLS (Alternate)
                                </span>
                                <p className="mt-0.5 text-soft">
                                    Host:{' '}
                                    <span className="font-mono text-ink">
                                        {host}
                                    </span>{' '}
                                    · Port{' '}
                                    <span className="font-mono font-bold text-ink">
                                        587
                                    </span>
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    copyValue('smtp587', `${host}:587`)
                                }
                            >
                                {copiedKey === 'smtp587' ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Stalwart Admin & Webmail */}
                <Card label="Stalwart Admin Console & Webmail">
                    <div className="space-y-4 pt-2 text-xs">
                        <div className="rounded-lg border border-line bg-paper/50 p-3.5">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-ink">
                                    Administrator Access
                                </span>
                                {info?.adminUrl && (
                                    <a
                                        href={info.adminUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={buttonClass(
                                            'secondary',
                                            'sm',
                                        )}
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Open Console
                                    </a>
                                )}
                            </div>

                            <div className="mt-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-soft">Login:</span>
                                    <span className="font-mono font-medium text-ink">
                                        {info?.adminLogin || 'admin'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-soft">Password:</span>
                                    <div className="flex items-center gap-1.5 font-mono">
                                        <span>
                                            {showPassword
                                                ? info?.adminPassword || '—'
                                                : '••••••••••••••••'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowPassword(!showPassword)
                                            }
                                            className="text-soft transition hover:text-ink"
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-3.5 w-3.5" />
                                            ) : (
                                                <Eye className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                        {info?.adminPassword && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    copyValue(
                                                        'adminPass',
                                                        info.adminPassword!,
                                                    )
                                                }
                                                className="text-soft transition hover:text-ink"
                                            >
                                                {copiedKey === 'adminPass' ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-line bg-paper/50 p-3.5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-semibold text-ink">
                                        Browser Webmail
                                    </span>
                                    <p className="mt-0.5 text-soft">
                                        {info?.webmailUrl
                                            ? 'SnappyMail is deployed on this server'
                                            : 'Deploy Webmail via Cluster Tools'}
                                    </p>
                                </div>
                                {info?.webmailUrl ? (
                                    <a
                                        href={info.webmailUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={buttonClass('primary', 'sm')}
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Launch Webmail
                                    </a>
                                ) : (
                                    <a
                                        href={`/servers/${server.name}/tools`}
                                        className={buttonClass(
                                            'secondary',
                                            'sm',
                                        )}
                                    >
                                        <Server className="h-3.5 w-3.5" />
                                        View Tools
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Laravel App Wiring Card */}
            <Card label="Laravel Application Wiring (.env & larakube mail:wire)">
                <div className="space-y-3 pt-2 text-xs">
                    <p className="text-soft">
                        You can wire any Laravel project running on your fleet
                        to Stalwart in one click using the CLI, or paste these
                        settings into your project's{' '}
                        <code className="font-mono text-ink">.env</code>:
                    </p>

                    <div className="flex items-center gap-2 rounded-lg bg-term p-3 font-mono text-[11px] text-term-bright">
                        <Terminal className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span className="truncate">
                            larakube mail:wire &lt;project-name&gt; production
                            --context={server.context}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto text-term-bright hover:bg-white/10"
                            onClick={() =>
                                copyValue(
                                    'wireCmd',
                                    `larakube mail:wire <project-name> production --context=${server.context}`,
                                )
                            }
                        >
                            {copiedKey === 'wireCmd' ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                                <Copy className="h-3.5 w-3.5" />
                            )}
                        </Button>
                    </div>

                    <div className="relative rounded-lg border border-line bg-paper p-3">
                        <pre className="font-mono text-[11px] leading-relaxed text-ink">
                            {envSnippet}
                        </pre>
                        <div className="absolute top-3 right-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    copyValue('envSnippet', envSnippet)
                                }
                            >
                                {copiedKey === 'envSnippet' ? (
                                    <>
                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-3.5 w-3.5" />
                                        Copy .env
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
