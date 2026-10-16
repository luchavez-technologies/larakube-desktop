import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Form } from '@inertiajs/react';
import {
    X,
    Server,
    Globe,
    GitBranch,
    RotateCw,
    Save,
    Key,
    Check,
    ChevronDown,
    ShieldCheck,
    ArrowRight,
} from 'lucide-react';
import { SiGithub, SiGitlab, SiForgejo } from '@icons-pack/react-simple-icons';
import Button from '@/components/button';
import SelectMenu from '@/components/select-menu';
import Redactable from '@/components/redactable';
import ProviderLogo from '@/components/provider-logo';
import HostPicker from '@/components/host-picker';
import { useRightDrawerOpen } from '@/lib/right-drawer-open';
import { cn } from '@/lib/utils';
import {
    ci as configureCiRoute,
    host as setHost,
    link,
} from '@/routes/projects';
import { show as showServer } from '@/routes/servers';
import {
    providerLabels,
    type Project,
    type ProjectEnvironment,
    type ServerDomain,
    type Server as StackServerModel,
} from '@/types/larakube';

export type ReadyServer = {
    name: string;
    ip: string | null;
    provider?: string | null;
};

export type EnvironmentSettingsDrawerSection =
    | 'server'
    | 'address'
    | 'pipeline';

export type EnvironmentSettingsDrawerProps = {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    environment: string;
    activeServer: ReadyServer | StackServerModel | null;
    readyServers: ReadyServer[];
    activeHost?: string | null;
    domains?: ServerDomain[] | null;
    activeCi?: ProjectEnvironment['ci'];
    initialSection?: EnvironmentSettingsDrawerSection | null;
    onSuccess?: () => void;
};

export function LinkServerForm({
    project,
    servers,
    environment = 'production',
    onSuccess,
}: {
    project: Project;
    servers: ReadyServer[];
    environment?: string;
    onSuccess?: () => void;
}) {
    const [server, setServer] = useState(servers[0]?.name ?? '');

    return (
        <Form
            action={link(project.id)}
            className="space-y-2"
            onSuccess={onSuccess}
        >
            {({ processing }) => (
                <>
                    <input
                        type="hidden"
                        name="environment"
                        value={environment}
                    />
                    <div className="space-y-2">
                        <SelectMenu
                            name="server"
                            value={server}
                            accent="servers"
                            disabled={!project.initialized || processing}
                            className="w-full min-w-0"
                            triggerClassName="py-2 text-xs truncate rounded-xl"
                            onChange={setServer}
                            options={servers.map((candidate) => ({
                                value: candidate.name,
                                label: (
                                    <>
                                        {candidate.name}
                                        {candidate.provider
                                            ? ` (${providerLabels[candidate.provider] ?? candidate.provider})`
                                            : ''}
                                        {candidate.ip && (
                                            <>
                                                {' · '}
                                                <Redactable
                                                    value={candidate.ip}
                                                    kind="ip"
                                                />
                                            </>
                                        )}
                                    </>
                                ),
                            }))}
                        />
                        <div className="flex items-center justify-end">
                            <Button
                                type="submit"
                                size="sm"
                                disabled={
                                    !project.initialized ||
                                    processing ||
                                    servers.length === 0
                                }
                            >
                                <RotateCw
                                    className={cn(
                                        'size-3',
                                        processing && 'animate-spin',
                                    )}
                                />
                                <span>
                                    {processing ? 'Linking…' : 'Link Server'}
                                </span>
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </Form>
    );
}

export function HostForm({
    project,
    serverIp,
    serverName,
    disabled,
    environment = 'production',
    currentHost,
    domains,
    onSuccess,
}: {
    project: Project;
    serverIp: string | null;
    serverName?: string | null;
    disabled: boolean;
    environment?: string;
    currentHost?: string | null;
    domains?: ServerDomain[] | null;
    onSuccess?: () => void;
}) {
    const [value, setValue] = useState(currentHost ?? project.webHost ?? '');
    const [justSaved, setJustSaved] = useState(false);

    useEffect(() => {
        setValue(currentHost ?? '');
    }, [currentHost]);

    const handleHostChange = useCallback((resolvedHost: string) => {
        setJustSaved(false);
        setValue(resolvedHost);
    }, []);

    const isChangingLiveHost = Boolean(currentHost) && value !== currentHost;

    const matchedZone = useMemo(() => {
        if (!domains || value === '') return null;
        return (
            domains.find(
                (d) =>
                    d.externalDns &&
                    (value === d.domain || value.endsWith(`.${d.domain}`)),
            ) ?? null
        );
    }, [domains, value]);

    return (
        <Form
            action={setHost(project.id)}
            className="space-y-3"
            onSuccess={() => {
                setJustSaved(true);
                onSuccess?.();
            }}
        >
            {({ errors, processing }) => (
                <>
                    <input
                        type="hidden"
                        name="environment"
                        value={environment}
                    />

                    <HostPicker
                        name="host"
                        value={value}
                        defaultValue={currentHost}
                        onChange={handleHostChange}
                        domains={domains}
                        serverName={serverName}
                        serverIp={serverIp}
                        defaultSubdomain={project.name
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, '')}
                        disabled={disabled || processing}
                        isLocal={
                            serverIp === '127.0.0.1' ||
                            serverIp === 'localhost' ||
                            serverIp === 'local' ||
                            !serverIp
                        }
                    />

                    {errors.host && (
                        <p className="text-xs text-accent">{errors.host}</p>
                    )}

                    {!errors.host && isChangingLiveHost && (
                        <p className="rounded-xl bg-paper px-3 py-2.5 text-xs text-soft ring-1 ring-line/60">
                            {justSaved ? (
                                <>
                                    Saved. <strong>{currentHost}</strong> keeps
                                    serving traffic until you deploy — click{' '}
                                    <strong>Deploy</strong> to create the new
                                    address&rsquo;s Ingress and TLS certificate.
                                </>
                            ) : (
                                <>
                                    Saving only updates the blueprint — it takes
                                    a <strong>Deploy</strong> afterward to
                                    actually go live.
                                </>
                            )}{' '}
                            {matchedZone ? (
                                <>
                                    <strong>{value || 'The new name'}</strong>
                                    &rsquo;s DNS record will be created
                                    automatically by ExternalDNS once you
                                    deploy.
                                </>
                            ) : (
                                <>
                                    Point{' '}
                                    <strong>{value || 'the new name'}</strong>
                                    &rsquo;s DNS at {serverIp ??
                                        'the server'}{' '}
                                    same as above.
                                </>
                            )}{' '}
                            <strong>{currentHost}</strong>&rsquo;s own DNS
                            record and anyone linking to it are untouched — it
                            simply stops resolving to anything once you deploy.
                        </p>
                    )}

                    <div className="flex items-center justify-end pt-1">
                        <Button
                            type="submit"
                            size="sm"
                            disabled={
                                disabled ||
                                processing ||
                                value === '' ||
                                value === (currentHost ?? '')
                            }
                        >
                            {processing ? (
                                <RotateCw className="size-3 animate-spin" />
                            ) : (
                                <Save className="size-3" />
                            )}
                            <span>
                                {processing ? 'Saving…' : 'Save Address'}
                            </span>
                        </Button>
                    </div>
                </>
            )}
        </Form>
    );
}

export function CiPipelineForm({
    project,
    environment,
    currentCi,
    onSuccess,
    onSkip,
}: {
    project: Project;
    environment: string;
    currentCi?: ProjectEnvironment['ci'];
    onSuccess?: () => void;
    onSkip?: () => void;
}) {
    const defaultRegistry =
        currentCi?.registry?.provider ??
        (project.git?.platform === 'gitlab'
            ? 'gitlab'
            : project.git?.platform === 'forgejo'
              ? 'forgejo'
              : 'ghcr');
    const defaultImage =
        currentCi?.registry?.image ??
        project.git?.repoSlug ??
        project.name.toLowerCase();
    const defaultBranch = currentCi?.branch ?? 'main';

    const [registry, setRegistry] = useState(defaultRegistry);
    const [image, setImage] = useState(defaultImage);
    const [branch, setBranch] = useState(defaultBranch);
    const [showSecurity, setShowSecurity] = useState(false);

    // Security Gate Toggles
    const [withTests, setWithTests] = useState(
        currentCi?.securityAudit?.withTests ?? true,
    );
    const [strict, setStrict] = useState(
        currentCi?.securityAudit?.strict ?? false,
    );
    const [scanGitleaks, setScanGitleaks] = useState(
        !(currentCi?.securityAudit?.noGitleaks ?? false),
    );
    const [scanSemgrep, setScanSemgrep] = useState(
        !(currentCi?.securityAudit?.noSemgrep ?? false),
    );
    const [scanTrivy, setScanTrivy] = useState(
        !(currentCi?.securityAudit?.noTrivy ?? false),
    );

    return (
        <Form
            action={configureCiRoute(project.id)}
            onSuccess={onSuccess}
            className="space-y-3"
        >
            {({ processing, errors }) => (
                <>
                    <input
                        type="hidden"
                        name="environment"
                        value={environment}
                    />
                    <input type="hidden" name="registry" value={registry} />
                    <input type="hidden" name="branch" value={branch} />
                    <input type="hidden" name="image" value={image} />
                    {withTests && (
                        <input type="hidden" name="with_tests" value="1" />
                    )}
                    {strict && <input type="hidden" name="strict" value="1" />}
                    {!scanGitleaks && (
                        <input type="hidden" name="no_gitleaks" value="1" />
                    )}
                    {!scanSemgrep && (
                        <input type="hidden" name="no_semgrep" value="1" />
                    )}
                    {!scanTrivy && (
                        <input type="hidden" name="no_trivy" value="1" />
                    )}

                    {project.git?.platform && (
                        <div className="flex items-center gap-2 rounded-xl border border-line/60 bg-paper/60 px-3 py-2 text-xs text-soft">
                            {project.git.platform === 'gitlab' ? (
                                <SiGitlab className="size-3.5 text-[#FC6D26]" />
                            ) : project.git.platform === 'forgejo' ? (
                                <SiForgejo className="size-3.5 text-[#FB532A]" />
                            ) : (
                                <SiGithub className="size-3.5 text-ink" />
                            )}
                            <span>
                                Git remote detected:{' '}
                                <strong className="text-ink">
                                    {project.git.repoSlug ?? project.git.remote}
                                </strong>
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-ink">
                                Container Registry
                            </label>
                            <SelectMenu
                                value={registry}
                                accent="servers"
                                disabled={processing}
                                triggerClassName="py-1.5 text-[13px] rounded-xl"
                                onChange={setRegistry}
                                options={[
                                    {
                                        value: 'ghcr',
                                        label: 'GitHub Container Registry (GHCR)',
                                    },
                                    {
                                        value: 'dockerhub',
                                        label: 'Docker Hub',
                                    },
                                    {
                                        value: 'gitlab',
                                        label: 'GitLab Registry',
                                    },
                                    {
                                        value: 'forgejo',
                                        label: 'Forgejo Registry',
                                    },
                                    {
                                        value: 'gar',
                                        label: 'Google Artifact Registry (GAR)',
                                    },
                                ]}
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-ink">
                                Branch
                            </label>
                            <input
                                type="text"
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                disabled={processing}
                                placeholder="main"
                                className="w-full rounded-xl border-0 bg-surface px-3 py-2 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-ink">
                            Image Name / Repository Path
                        </label>
                        <input
                            type="text"
                            value={image}
                            onChange={(e) => setImage(e.target.value)}
                            disabled={processing}
                            placeholder="username/repository"
                            className="w-full rounded-xl border-0 bg-surface px-3 py-2 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                        />
                    </div>

                    {/* Security Gates Accordion */}
                    <div className="rounded-xl border border-line bg-surface p-3">
                        <button
                            type="button"
                            onClick={() => setShowSecurity(!showSecurity)}
                            className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-ink"
                        >
                            <div className="flex items-center gap-1.5">
                                <ShieldCheck className="size-3.5 text-brand" />
                                <span>Security Audit &amp; Policy Gates</span>
                            </div>
                            <ChevronDown
                                className={cn(
                                    'size-3.5 text-soft transition-transform duration-200',
                                    showSecurity && 'rotate-180',
                                )}
                            />
                        </button>

                        {showSecurity && (
                            <div className="mt-3 space-y-2 border-t border-line/60 pt-3 text-xs">
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={withTests}
                                        onChange={(e) =>
                                            setWithTests(e.target.checked)
                                        }
                                        className="rounded border-line text-brand focus:ring-brand"
                                    />
                                    <span>
                                        Run Automated Tests before deploy
                                    </span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={strict}
                                        onChange={(e) =>
                                            setStrict(e.target.checked)
                                        }
                                        className="rounded border-line text-brand focus:ring-brand"
                                    />
                                    <span>
                                        Strict Mode (fail pipeline on any
                                        vulnerability)
                                    </span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={scanGitleaks}
                                        onChange={(e) =>
                                            setScanGitleaks(e.target.checked)
                                        }
                                        className="rounded border-line text-brand focus:ring-brand"
                                    />
                                    <span>
                                        Scan for leaked secrets (Gitleaks)
                                    </span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={scanSemgrep}
                                        onChange={(e) =>
                                            setScanSemgrep(e.target.checked)
                                        }
                                        className="rounded border-line text-brand focus:ring-brand"
                                    />
                                    <span>
                                        SAST Code Security Scan (Semgrep)
                                    </span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={scanTrivy}
                                        onChange={(e) =>
                                            setScanTrivy(e.target.checked)
                                        }
                                        className="rounded border-line text-brand focus:ring-brand"
                                    />
                                    <span>
                                        Container Vulnerability Scan (Trivy)
                                    </span>
                                </label>
                            </div>
                        )}
                    </div>

                    {errors.environment && (
                        <p className="text-xs text-accent">
                            {errors.environment}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <Button
                            type="submit"
                            size="sm"
                            disabled={processing}
                            className="gap-1.5"
                        >
                            {processing ? (
                                <RotateCw className="size-3.5 animate-spin" />
                            ) : currentCi?.hasWorkflow ? (
                                <Save className="size-3.5" />
                            ) : (
                                <GitBranch className="size-3.5" />
                            )}
                            <span>
                                {processing
                                    ? 'Configuring CI/CD…'
                                    : currentCi?.hasWorkflow
                                      ? 'Update Pipeline & Secrets'
                                      : 'Configure & Push Secrets'}
                            </span>
                        </Button>
                        {onSkip && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onSkip}
                                className="gap-1 text-soft hover:text-ink"
                            >
                                <span>Skip to Direct Deploy</span>
                                <ArrowRight className="size-3" />
                            </Button>
                        )}
                    </div>
                </>
            )}
        </Form>
    );
}

export default function EnvironmentSettingsDrawer({
    isOpen,
    onClose,
    project,
    environment,
    activeServer,
    readyServers,
    activeHost,
    domains,
    activeCi,
    initialSection = 'server',
    onSuccess,
}: EnvironmentSettingsDrawerProps) {
    const [slidIn, setSlidIn] = useState(false);
    const [highlightedSection, setHighlightedSection] =
        useState<EnvironmentSettingsDrawerSection | null>(null);

    const [showRotateConfirm, setShowRotateConfirm] = useState(false);

    const serverRef = useRef<HTMLDivElement>(null);
    const addressRef = useRef<HTMLDivElement>(null);
    const pipelineRef = useRef<HTMLDivElement>(null);

    useRightDrawerOpen(isOpen);

    // Slide-in transition trigger
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => setSlidIn(true), 20);
            return () => clearTimeout(timer);
        } else {
            setSlidIn(false);
        }
    }, [isOpen]);

    const handleClose = () => {
        setSlidIn(false);
        setTimeout(() => onClose(), 250);
    };

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen]);

    // Focus & auto-scroll to initial section with visual pulse highlight
    useEffect(() => {
        if (!isOpen) {
            setHighlightedSection(null);
            return;
        }

        const target = initialSection ?? 'server';
        setHighlightedSection(target);

        const timer = setTimeout(() => {
            const el = {
                server: serverRef.current,
                address: addressRef.current,
                pipeline: pipelineRef.current,
            }[target];

            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 220);

        // Fade out highlight ring after 1.8 seconds
        const fadeTimer = setTimeout(() => {
            setHighlightedSection(null);
        }, 1800);

        return () => {
            clearTimeout(timer);
            clearTimeout(fadeTimer);
        };
    }, [isOpen, initialSection]);

    const scrollToSection = (section: EnvironmentSettingsDrawerSection) => {
        setHighlightedSection(section);
        const el = {
            server: serverRef.current,
            address: addressRef.current,
            pipeline: pipelineRef.current,
        }[section];

        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => setHighlightedSection(null), 1800);
    };

    if (!isOpen) return null;

    return (
        <div
            className={cn(
                'fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity duration-300',
                slidIn ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onClick={handleClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={cn(
                    'flex h-full w-full max-w-xl flex-col overflow-hidden bg-surface shadow-2xl ring-1 ring-line transition-transform duration-300 ease-out md:max-w-2xl',
                    slidIn ? 'translate-x-0' : 'translate-x-full',
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drawer Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
                            <Server className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-ink">
                                Environment Settings ·{' '}
                                {environment.toUpperCase()}
                            </h2>
                            <p className="text-xs text-soft">
                                {project.name} · Target Server, Domain Address
                                &amp; Delivery Pipeline
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close drawer"
                        className="rounded-lg p-1.5 text-soft transition hover:bg-badge hover:text-ink focus:outline-none"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Quick Navigation Pills */}
                <div className="flex shrink-0 items-center gap-1.5 border-b border-line/70 bg-paper/50 px-6 py-2.5 text-xs">
                    <span className="mr-1 text-[11px] font-semibold tracking-wider text-faint uppercase">
                        Jump to:
                    </span>
                    <button
                        type="button"
                        onClick={() => scrollToSection('server')}
                        className={cn(
                            'inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition',
                            highlightedSection === 'server'
                                ? 'bg-brand/10 text-brand'
                                : 'text-soft hover:bg-surface hover:text-ink',
                        )}
                    >
                        <Server className="size-3" />
                        <span>Target Server</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => scrollToSection('address')}
                        className={cn(
                            'inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition',
                            highlightedSection === 'address'
                                ? 'bg-brand/10 text-brand'
                                : 'text-soft hover:bg-surface hover:text-ink',
                        )}
                    >
                        <Globe className="size-3" />
                        <span>Public Address</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => scrollToSection('pipeline')}
                        className={cn(
                            'inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition',
                            highlightedSection === 'pipeline'
                                ? 'bg-brand/10 text-brand'
                                : 'text-soft hover:bg-surface hover:text-ink',
                        )}
                    >
                        <GitBranch className="size-3" />
                        <span>Delivery Pipeline</span>
                    </button>
                </div>

                {/* Drawer Scrollable Body */}
                <div className="flex-1 [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent] space-y-6 overflow-y-auto p-6">
                    {/* Section 1: Target Server */}
                    <div
                        ref={serverRef}
                        className={cn(
                            'rounded-2xl border border-line bg-paper/40 p-5 transition-all duration-700',
                            highlightedSection === 'server'
                                ? 'bg-brand/5 shadow-md ring-2 ring-brand/60'
                                : 'ring-0',
                        )}
                    >
                        <div className="mb-4 flex items-center justify-between border-b border-line/60 pb-3">
                            <div className="flex items-center gap-2">
                                <Server className="size-4 text-brand" />
                                <h3 className="text-sm font-semibold text-ink">
                                    Target Server
                                </h3>
                            </div>
                            <span className="rounded-full bg-line/60 px-2 py-0.5 text-[10px] font-semibold text-soft uppercase">
                                Runtime Host
                            </span>
                        </div>

                        {/* Current Server Summary Card */}
                        {activeServer ? (
                            <div className="mb-4 flex items-center justify-between rounded-xl border border-line/60 bg-surface p-3 shadow-2xs">
                                <div className="flex items-center gap-3">
                                    <ProviderLogo
                                        provider={activeServer.provider}
                                        size="sm"
                                    />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <a
                                                href={
                                                    showServer(
                                                        activeServer.name,
                                                    ).url
                                                }
                                                className="truncate text-xs font-semibold text-ink hover:underline"
                                            >
                                                {activeServer.name}
                                            </a>
                                            {activeServer.provider && (
                                                <span className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-medium text-soft">
                                                    {providerLabels[
                                                        activeServer.provider
                                                    ] ?? activeServer.provider}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 font-mono text-[11px] text-soft">
                                            {activeServer.ip ? (
                                                <Redactable
                                                    value={activeServer.ip}
                                                    kind="ip"
                                                />
                                            ) : (
                                                'No public IP'
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ok dark:text-emerald-400">
                                    <Check className="size-3" /> Bound
                                </span>
                            </div>
                        ) : (
                            <div className="mb-4 rounded-xl border border-dashed border-line p-3 text-center text-xs text-soft">
                                No server linked to {environment} yet. Select a
                                ready server below.
                            </div>
                        )}

                        {/* Rebind Selector Form */}
                        <div>
                            <p className="mb-1.5 text-xs font-medium text-ink">
                                Rebind {environment} to another server:
                            </p>
                            <LinkServerForm
                                project={project}
                                servers={readyServers}
                                environment={environment}
                                onSuccess={onSuccess}
                            />
                        </div>
                    </div>

                    {/* Section 2: Public Address */}
                    <div
                        ref={addressRef}
                        className={cn(
                            'rounded-2xl border border-line bg-paper/40 p-5 transition-all duration-700',
                            highlightedSection === 'address'
                                ? 'bg-brand/5 shadow-md ring-2 ring-brand/60'
                                : 'ring-0',
                        )}
                    >
                        <div className="mb-4 flex items-center justify-between border-b border-line/60 pb-3">
                            <div className="flex items-center gap-2">
                                <Globe className="size-4 text-brand" />
                                <h3 className="text-sm font-semibold text-ink">
                                    Public Address &amp; Routing
                                </h3>
                            </div>
                            <span className="rounded-full bg-line/60 px-2 py-0.5 text-[10px] font-semibold text-soft uppercase">
                                Ingress &amp; SSL
                            </span>
                        </div>

                        <HostForm
                            project={project}
                            serverIp={activeServer?.ip ?? null}
                            serverName={activeServer?.name ?? null}
                            disabled={!project.initialized}
                            environment={environment}
                            currentHost={activeHost}
                            domains={domains}
                            onSuccess={onSuccess}
                        />
                    </div>

                    {/* Section 3: Delivery Pipeline & CI/CD */}
                    <div
                        ref={pipelineRef}
                        className={cn(
                            'rounded-2xl border border-line bg-paper/40 p-5 transition-all duration-700',
                            highlightedSection === 'pipeline'
                                ? 'bg-brand/5 shadow-md ring-2 ring-brand/60'
                                : 'ring-0',
                        )}
                    >
                        <div className="mb-4 flex items-center justify-between border-b border-line/60 pb-3">
                            <div className="flex items-center gap-2">
                                <GitBranch className="size-4 text-brand" />
                                <h3 className="text-sm font-semibold text-ink">
                                    Delivery Pipeline &amp; CI/CD
                                </h3>
                            </div>
                            <span className="rounded-full bg-line/60 px-2 py-0.5 text-[10px] font-semibold text-soft uppercase">
                                Automation
                            </span>
                        </div>

                        <CiPipelineForm
                            project={project}
                            environment={environment}
                            currentCi={activeCi}
                            onSuccess={onSuccess}
                        />

                        {/* Secret Rotation */}
                        <div className="mt-5 border-t border-line/60 pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-semibold text-ink">
                                        Scoped Deployer Secrets
                                    </h4>
                                    <p className="text-[11px] text-soft">
                                        Rotate ephemeral deploy tokens stored in
                                        Git repository secrets.
                                    </p>
                                </div>
                                {!showRotateConfirm && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                            setShowRotateConfirm(true)
                                        }
                                    >
                                        <Key className="size-3" />
                                        <span>Rotate Secrets</span>
                                    </Button>
                                )}
                            </div>

                            {showRotateConfirm && (
                                <div className="mt-3 rounded-xl border border-line bg-surface p-3">
                                    <p className="mb-2.5 text-xs text-ink">
                                        Rotate deployer secrets for{' '}
                                        <strong className="font-semibold">
                                            {environment}
                                        </strong>
                                        ?
                                    </p>
                                    <Form
                                        action={configureCiRoute(project.id)}
                                        onSuccess={() =>
                                            setShowRotateConfirm(false)
                                        }
                                    >
                                        <input
                                            type="hidden"
                                            name="environment"
                                            value={environment}
                                        />
                                        <input
                                            type="hidden"
                                            name="rotate"
                                            value="1"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="submit"
                                                size="sm"
                                                variant="primary"
                                            >
                                                <RotateCw className="size-3" />
                                                <span>Confirm Rotate</span>
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                onClick={() =>
                                                    setShowRotateConfirm(false)
                                                }
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </Form>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Drawer Footer */}
                <div className="flex shrink-0 items-center justify-between border-t border-line bg-paper/30 px-6 py-3.5">
                    <p className="text-[11px] text-soft">
                        Settings update the blueprint. Deploy afterward to apply
                        changes.
                    </p>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleClose}
                    >
                        <X className="size-3" />
                        <span>Done</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
