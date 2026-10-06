import { Form } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Send, Check, Trash2, Info, CheckCircle2 } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { Server as ServerType } from '@/types/larakube';
import type { RelayInfo } from './settings-tab';

type Props = {
    server: ServerType;
    relay?: RelayInfo | null;
};

export default function RelayTab({ server, relay }: Props) {
    const initialProvider = relay?.configured
        ? relay.provider === 'ses'
            ? 'ses'
            : 'brevo'
        : 'brevo';

    const [provider, setProvider] = useState<'brevo' | 'ses' | 'remove'>(
        initialProvider,
    );
    const [username, setUsername] = useState(relay?.username ?? '');
    const [apiKey, setApiKey] = useState('');
    const [region, setRegion] = useState(relay?.region ?? 'us-east-1');
    const [port, setPort] = useState(
        String(relay?.port ?? (initialProvider === 'ses' ? '2587' : '2525')),
    );

    useEffect(() => {
        if (relay?.configured) {
            setProvider(relay.provider === 'ses' ? 'ses' : 'brevo');
            if (relay.username) setUsername(relay.username);
            if (relay.region) setRegion(relay.region);
            if (relay.port) setPort(String(relay.port));
        }
    }, [relay]);

    // Test email state
    const [testTo, setTestTo] = useState('');
    const [testFrom, setTestFrom] = useState('');
    const [testPassword, setTestPassword] = useState('');

    const isCurrentProviderActive =
        Boolean(relay?.configured) && relay?.provider === provider;

    return (
        <div className="space-y-6">
            {relay?.configured ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-800 dark:text-emerald-300">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div>
                            <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                                Active Outbound Relay:{' '}
                                {relay.provider === 'ses'
                                    ? 'Amazon SES'
                                    : relay.provider === 'brevo'
                                      ? 'Brevo'
                                      : relay.provider.toUpperCase()}
                            </p>
                            <p className="mt-0.5 text-emerald-700/80 dark:text-emerald-400/80">
                                Outbound delivery routes via{' '}
                                <span className="font-mono font-medium">
                                    {relay.host || relay.provider}
                                </span>{' '}
                                on port{' '}
                                <span className="font-mono font-medium">
                                    {relay.port}
                                </span>
                                {relay.username ? (
                                    <>
                                        {' '}
                                        (login:{' '}
                                        <span className="font-mono">
                                            {relay.username}
                                        </span>
                                        )
                                    </>
                                ) : null}
                                .
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active Relay
                    </span>
                </div>
            ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-400">
                    <div className="flex items-start gap-3">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div className="space-y-1">
                            <p className="font-semibold text-amber-800 dark:text-amber-300">
                                Why is an outbound relay required on cloud
                                servers?
                            </p>
                            <p className="leading-relaxed">
                                Major cloud hosting providers (DigitalOcean,
                                AWS, Hetzner, Linode) strictly block outbound
                                port 25 to prevent network spam. Without an
                                outbound relay (such as Brevo or Amazon SES),
                                external messages to Gmail, Microsoft 365, or
                                Yahoo will queue and eventually bounce. Internal
                                mail between local accounts works immediately
                                without a relay.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Outbound Relay Setup Card */}
                <Card label="Outbound Relay Configuration">
                    <Form
                        action={`/servers/${server.name}/mail/relay`}
                        method="post"
                        className="space-y-4 pt-2"
                    >
                        <div>
                            <label className="mb-2 block text-xs font-medium text-soft">
                                Select Relay Provider
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProvider('brevo');
                                        setPort('2525');
                                    }}
                                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                                        provider === 'brevo'
                                            ? 'border-brand bg-brand/10 text-brand ring-1 ring-brand'
                                            : 'border-line bg-paper/40 text-soft hover:bg-paper'
                                    }`}
                                >
                                    <span className="text-xs font-semibold">
                                        Brevo
                                    </span>
                                    <span className="mt-0.5 text-[10px] opacity-75">
                                        Free 300/day
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setProvider('ses');
                                        setPort('2587');
                                    }}
                                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                                        provider === 'ses'
                                            ? 'border-brand bg-brand/10 text-brand ring-1 ring-brand'
                                            : 'border-line bg-paper/40 text-soft hover:bg-paper'
                                    }`}
                                >
                                    <span className="text-xs font-semibold">
                                        Amazon SES
                                    </span>
                                    <span className="mt-0.5 text-[10px] opacity-75">
                                        Low-cost bulk
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setProvider('remove')}
                                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                                        provider === 'remove'
                                            ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent'
                                            : 'border-line bg-paper/40 text-soft hover:bg-paper'
                                    }`}
                                >
                                    <span className="text-xs font-semibold">
                                        Direct MX
                                    </span>
                                    <span className="mt-0.5 text-[10px] opacity-75">
                                        Disable relay
                                    </span>
                                </button>
                            </div>
                        </div>

                        <input type="hidden" name="provider" value={provider} />

                        {provider !== 'remove' ? (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-soft">
                                        SMTP Username / Access Key
                                    </label>
                                    <input
                                        type="text"
                                        name="username"
                                        required
                                        value={username}
                                        onChange={(e) =>
                                            setUsername(e.target.value)
                                        }
                                        placeholder={
                                            provider === 'brevo'
                                                ? 'e.g. 7192837@smtp-brevo.com'
                                                : 'e.g. AKIAIOSFODNN7EXAMPLE'
                                        }
                                        className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-soft">
                                        SMTP Password / Secret Key
                                    </label>
                                    <input
                                        type="password"
                                        name="api_key"
                                        required={!isCurrentProviderActive}
                                        value={apiKey}
                                        onChange={(e) =>
                                            setApiKey(e.target.value)
                                        }
                                        placeholder={
                                            isCurrentProviderActive
                                                ? '•••••••• (Saved on cluster — leave blank to keep)'
                                                : provider === 'brevo'
                                                  ? 'xsmtpsib-...'
                                                  : 'Amazon SES SMTP password'
                                        }
                                        className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                    />
                                    {isCurrentProviderActive && (
                                        <p className="mt-1 text-[11px] text-soft">
                                            Credentials are active on the
                                            cluster. Leave blank to keep current
                                            secret, or enter a new one to
                                            update.
                                        </p>
                                    )}
                                </div>

                                {provider === 'ses' && (
                                    <div>
                                        <label className="block text-xs font-medium text-soft">
                                            AWS Region
                                        </label>
                                        <input
                                            type="text"
                                            name="region"
                                            value={region}
                                            onChange={(e) =>
                                                setRegion(e.target.value)
                                            }
                                            placeholder="us-east-1"
                                            className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-medium text-soft">
                                        Relay Port
                                    </label>
                                    <input
                                        type="number"
                                        name="port"
                                        value={port}
                                        onChange={(e) =>
                                            setPort(e.target.value)
                                        }
                                        className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                                    />
                                    <p className="mt-1 text-[11px] text-soft">
                                        Brevo standard is 2525. SES standard is
                                        2587 or 587.
                                    </p>
                                </div>

                                <div className="pt-2">
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        size="sm"
                                    >
                                        <Check className="h-4 w-4" />
                                        Save Relay Route
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4 pt-2">
                                <p className="text-xs text-soft">
                                    Removing the relay will configure Stalwart
                                    to deliver directly to external destination
                                    MX records over port 25. Only use this if
                                    your server provider permits outbound port
                                    25.
                                </p>
                                <Button
                                    type="submit"
                                    variant="danger"
                                    size="sm"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Remove Relay & Use Direct MX
                                </Button>
                            </div>
                        )}
                    </Form>
                </Card>

                {/* Send Test Email Card */}
                <Card label="Send Live Test Email">
                    <p className="text-xs text-soft">
                        Dispatch a test email through Stalwart's authenticated
                        SMTP pipeline to confirm deliverability end-to-end.
                    </p>

                    <Form
                        action={`/servers/${server.name}/mail/test`}
                        method="post"
                        className="mt-4 space-y-4"
                    >
                        <div>
                            <label className="block text-xs font-medium text-soft">
                                Recipient Email Address
                            </label>
                            <input
                                type="email"
                                name="to"
                                required
                                value={testTo}
                                onChange={(e) => setTestTo(e.target.value)}
                                placeholder="you@gmail.com"
                                className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-soft">
                                Sender Account (Optional)
                            </label>
                            <input
                                type="email"
                                name="from"
                                value={testFrom}
                                onChange={(e) => setTestFrom(e.target.value)}
                                placeholder="postmaster@yourdomain.com (or leave blank for default)"
                                className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-soft">
                                Sender Password (Optional)
                            </label>
                            <input
                                type="password"
                                name="password"
                                value={testPassword}
                                onChange={(e) =>
                                    setTestPassword(e.target.value)
                                }
                                placeholder="Leave blank if using default account"
                                className="placeholder:text-muted mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                        </div>

                        <div className="pt-2">
                            <Button type="submit" variant="secondary" size="sm">
                                <Send className="h-4 w-4" />
                                Dispatch Test Email
                            </Button>
                        </div>
                    </Form>
                </Card>
            </div>
        </div>
    );
}
