import { Form } from '@inertiajs/react';
import { useState } from 'react';
import {
    Download,
    Mail,
    ShieldCheck,
    Globe,
    Layers,
    Server as ServerIcon,
    ArrowRight,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { Server } from '@/types/larakube';

type Props = {
    server: Server;
    otherServers?: Server[];
};

export default function MailEmptyState({ server, otherServers = [] }: Props) {
    const [domain, setDomain] = useState('');
    const [adminEmail, setAdminEmail] = useState('');

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface/60 p-8 backdrop-blur-xs">
                <div className="max-w-2xl">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                        <Mail className="h-6 w-6" />
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight text-ink">
                        Deploy Stalwart Mail Server on {server.name}
                    </h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-soft">
                        Stalwart is an enterprise-grade, all-in-one mail server
                        written in Rust with support for JMAP, IMAP, SMTP,
                        built-in spam filtering, and automated DKIM signing.
                        Manage all fleet mailboxes and transactional sending
                        from one unified cluster dashboard.
                    </p>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-line bg-surface p-4">
                        <ShieldCheck className="mb-2 h-5 w-5 text-emerald-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Automatic DKIM & SPF
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            Automated 2048-bit RSA key generation and DNS record
                            verification.
                        </p>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <Globe className="mb-2 h-5 w-5 text-sky-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Modern JMAP & IMAP
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            High-speed synchronized access for Apple Mail,
                            Thunderbird, and webmail.
                        </p>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <Layers className="mb-2 h-5 w-5 text-violet-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Multi-Domain Fleet
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            Host unlimited client and project domains on a
                            single shared instance.
                        </p>
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <Mail className="mb-2 h-5 w-5 text-amber-500" />
                        <h3 className="text-xs font-semibold tracking-wider text-ink uppercase">
                            Webmail & Relays
                        </h3>
                        <p className="mt-1 text-xs text-soft">
                            One-click Bulwark webmail interface plus built-in
                            Amazon SES and Brevo relays.
                        </p>
                    </div>
                </div>

                <div className="mt-8 max-w-xl rounded-xl border border-line bg-paper/50 p-5">
                    <h3 className="text-sm font-medium text-ink">
                        Initialize Mail Server
                    </h3>
                    <p className="mt-1 text-xs text-soft">
                        Choose the primary domain to configure with Stalwart on
                        this server.
                    </p>

                    <Form
                        action={`/servers/${server.name}/mail/deploy`}
                        method="post"
                        className="mt-4 space-y-4"
                    >
                        <div>
                            <label className="block text-xs font-medium text-soft">
                                Primary Mail Domain
                            </label>
                            <input
                                type="text"
                                name="domain"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                placeholder="e.g. mail.example.com"
                                className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-soft">
                                Initial Postmaster / Admin Email (Optional)
                            </label>
                            <input
                                type="email"
                                name="admin_email"
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                placeholder="postmaster@example.com"
                                className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                        </div>

                        <div className="pt-2">
                            <Button type="submit" variant="primary">
                                <Download className="h-4 w-4" />
                                Deploy Stalwart Mail Server
                            </Button>
                        </div>
                    </Form>
                </div>
            </div>

            {otherServers.length > 0 && (
                <Card label="Active Mail Servers on other nodes">
                    <div className="space-y-2 pt-2">
                        <p className="text-xs text-soft">
                            Stalwart Mail Server is already running on these
                            servers in your fleet:
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {otherServers.map((other) => (
                                <a
                                    key={other.name}
                                    href={`/servers/${other.name}/mail`}
                                    className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-xs font-medium text-ink transition hover:border-emerald-500/50 hover:bg-paper"
                                >
                                    <div className="flex items-center gap-2">
                                        <ServerIcon className="h-4 w-4 text-emerald-500" />
                                        <span>{other.name}</span>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-soft" />
                                </a>
                            ))}
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
