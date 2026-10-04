import { Link, router } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';
import Button from '@/components/button';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import PageHeader from '@/components/page-header';
import StatusPill from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import {
    domains as findDomains,
    index,
    removeDomain,
    shareDomain,
} from '@/routes/devboxes';

const permissions = [
    'Account → Cloudflare Tunnel → Edit',
    'Zone → DNS → Edit',
    'Zone → Zone → Read',
];

/** The value of a cookie, for the CSRF header on the one request that is not an Inertia visit. */
function cookie(name: string): string {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));

    return match ? decodeURIComponent(match[1]) : '';
}

export default function ShareDomain({
    box,
    project,
}: {
    box: string;
    project: string;
}) {
    const [token, setToken] = useState('');
    const [domains, setDomains] = useState<string[] | null>(null);
    const [domain, setDomain] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const find = async () => {
        setBusy(true);
        setError(null);

        try {
            const response = await fetch(findDomains({ box }).url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': cookie('XSRF-TOKEN'),
                },
                body: JSON.stringify({ token }),
            });
            const body = await response.json();

            if (!response.ok) {
                setDomains(null);
                setError(
                    body.message ??
                        'That did not work. Check the token and try again.',
                );

                return;
            }

            setDomains(body.domains);
            setDomain(body.domains[0] ?? '');
        } catch {
            setError('Could not reach the box. Try again in a moment.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <AppLayout title="Share">
            <PageHeader
                title="Share"
                subtitle={`Public names for ${project} on ${box} that stay the same: the app, Vite hot reload, Reverb and file storage, under a domain you own on Cloudflare.`}
                badge={<StatusPill tone="warn">Experimental</StatusPill>}
            />
            <Card className="max-w-3xl space-y-4 p-5.5">
                <Field
                    label="Cloudflare API token"
                    hint="Used for this run only and sent to the box without being saved there or on this computer."
                >
                    <input
                        type="password"
                        value={token}
                        onChange={(event) => {
                            setToken(event.target.value);
                            setDomains(null);
                        }}
                        autoFocus
                        spellCheck={false}
                        className="w-full rounded-lg border-0 px-3 py-2 font-mono text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                    />
                </Field>
                <div className="rounded-lg bg-paper px-3.5 py-3 text-[13px] leading-relaxed text-soft ring-1 ring-line ring-inset">
                    <p className="font-medium text-ink">
                        Create the token in Cloudflare with:
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                        {permissions.map((permission) => (
                            <li key={permission}>{permission}</li>
                        ))}
                    </ul>
                    <p className="mt-1">
                        The Edit zone DNS template alone is not enough. Limit it
                        to the domain you want to use.
                    </p>
                </div>

                {domains === null ? (
                    <Button
                        type="button"
                        onClick={find}
                        disabled={busy || token.trim() === ''}
                    >
                        {busy ? 'Asking the box…' : 'Find my domains'}
                    </Button>
                ) : (
                    <>
                        <Field
                            label="Domain"
                            hint="Names look like shop-box.example.com, one level under it, so Cloudflare's free certificate covers them."
                        >
                            <select
                                value={domain}
                                onChange={(event) =>
                                    setDomain(event.target.value)
                                }
                                className="w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                            >
                                {domains.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                disabled={domain === ''}
                                onClick={() =>
                                    router.post(
                                        shareDomain({ box, project }).url,
                                        { token, domain },
                                    )
                                }
                            >
                                Share under {domain}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() =>
                                    router.delete(
                                        removeDomain({ box, project }).url,
                                        { data: { token } },
                                    )
                                }
                            >
                                Remove this app&apos;s names
                            </Button>
                        </div>
                    </>
                )}
                {error && <p className="text-sm text-accent">{error}</p>}
                <p className="text-[13px] leading-relaxed text-soft">
                    Anyone with the link can open the app. Add a login with
                    Cloudflare Access if it should not be public.
                </p>
            </Card>
            <Link href={index().url} className={buttonClass('ghost', 'sm')}>
                Back to dev boxes
            </Link>
        </AppLayout>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-soft">
                {label}
            </span>
            {children}
            {hint && (
                <span className="mt-1 block text-xs text-soft">{hint}</span>
            )}
        </label>
    );
}
