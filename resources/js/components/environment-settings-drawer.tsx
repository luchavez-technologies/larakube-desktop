import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Form, router } from '@inertiajs/react';
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
    CheckCircle2,
    AlertTriangle,
    Database,
} from 'lucide-react';
import { SiGithub, SiGitlab, SiForgejo } from '@icons-pack/react-simple-icons';
import BackingServicesPicker, {
    eligibleBackingServices,
    type ServerPlexSummary,
} from '@/components/backing-services-picker';
import Button from '@/components/button';
import SelectMenu from '@/components/select-menu';
import Redactable from '@/components/redactable';
import ProviderLogo from '@/components/provider-logo';
import HostPicker from '@/components/host-picker';
import { ExternalLinkButton } from '@/lib/open-external';
import { useRightDrawerOpen } from '@/lib/right-drawer-open';
import { cn } from '@/lib/utils';
import {
    backingServices as backingServicesRoute,
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
    plex?: ServerPlexSummary | null;
};

export type EnvironmentSettingsDrawerSection =
    | 'server'
    | 'address'
    | 'services'
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
    activePlex?: string[];
    activeManaged?: string[];
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
    const remotes = useMemo(() => project.git?.remotes ?? [], [project.git]);
    const initialPlatform =
        currentCi?.platform ?? project.git?.platform ?? 'github';
    const initialRemote = currentCi?.gitRemote ?? remotes[0]?.name ?? 'origin';

    const defaultRegistry =
        currentCi?.registry?.provider ??
        (initialPlatform === 'gitlab'
            ? 'gitlab'
            : initialPlatform === 'forgejo'
              ? 'forgejo'
              : 'ghcr');
    const defaultImage =
        currentCi?.registry?.image ??
        currentCi?.repoSlug ??
        project.git?.repoSlug ??
        project.name.toLowerCase();
    const defaultBranch = currentCi?.branch ?? 'main';

    const [gitRemote, setGitRemote] = useState(initialRemote);
    const [ciPlatform, setCiPlatform] = useState(initialPlatform);
    const [savingTarget, setSavingTarget] = useState(false);
    const [registry, setRegistry] = useState(defaultRegistry);
    const [image, setImage] = useState(defaultImage);
    const [branch, setBranch] = useState(defaultBranch);
    const [showSecurity, setShowSecurity] = useState(false);

    const matchedRemoteHost = useMemo(() => {
        const matched = remotes.find((r) => r.name === gitRemote);
        return matched?.host && matched.host.includes('.') ? matched.host : '';
    }, [gitRemote, remotes]);

    const resolvedDefaultForgejoHost =
        currentCi?.forgejoHost ??
        (typeof currentCi?.registry?.host === 'string'
            ? currentCi.registry.host
            : '') ??
        matchedRemoteHost;

    const [forgejoHost, setForgejoHost] = useState(resolvedDefaultForgejoHost);
    const [forgejoToken, setForgejoToken] = useState('');
    const [connectingForgejo, setConnectingForgejo] = useState(false);
    const [showReconnectForgejo, setShowReconnectForgejo] = useState(false);
    const [forgejoError, setForgejoError] = useState<string | null>(null);
    const [forgejoConnectedJustNow, setForgejoConnectedJustNow] =
        useState(false);

    useEffect(() => {
        setGitRemote(currentCi?.gitRemote ?? remotes[0]?.name ?? 'origin');
    }, [currentCi?.gitRemote, environment, remotes]);

    useEffect(() => {
        setCiPlatform(currentCi?.platform ?? project.git?.platform ?? 'github');
    }, [currentCi?.platform, environment, project.git?.platform]);

    useEffect(() => {
        if (resolvedDefaultForgejoHost !== '') {
            setForgejoHost(resolvedDefaultForgejoHost);
        }
    }, [resolvedDefaultForgejoHost, environment]);

    function persistCiTarget(nextRemote: string, nextPlatform: string) {
        setSavingTarget(true);
        router.post(
            configureCiRoute(project.id).url,
            {
                environment,
                git_remote: nextRemote,
                ci_platform: nextPlatform,
                save_target_only: true,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setSavingTarget(false),
            },
        );
    }

    function handleConnectForgejo() {
        const cleanHost = forgejoHost.trim();
        const cleanToken = forgejoToken.trim();
        if (cleanHost === '') {
            setForgejoError(
                'Enter your Forgejo domain (e.g. git.example.com).',
            );
            return;
        }
        if (cleanToken === '') {
            setForgejoError('Paste a Forgejo personal access token.');
            return;
        }

        setConnectingForgejo(true);
        setForgejoError(null);
        setForgejoConnectedJustNow(false);

        router.post(
            configureCiRoute(project.id).url,
            {
                environment,
                ci_platform: 'forgejo',
                git_remote: gitRemote,
                forgejo_host: cleanHost,
                git_login_token: cleanToken,
                save_target_only: true,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => {
                    setForgejoToken('');
                    setShowReconnectForgejo(false);
                    setForgejoConnectedJustNow(true);
                },
                onError: (errs) => {
                    setForgejoError(
                        errs.git_login_token ??
                            errs.forgejo_host ??
                            'Could not log tea in to Forgejo.',
                    );
                },
                onFinish: () => setConnectingForgejo(false),
            },
        );
    }

    function handleSelectPlatform(nextPlatform: string) {
        setCiPlatform(nextPlatform);
        if (
            nextPlatform === 'forgejo' &&
            (registry === 'ghcr' || registry === 'gitlab')
        ) {
            setRegistry('forgejo');
        } else if (
            nextPlatform === 'gitlab' &&
            (registry === 'ghcr' || registry === 'forgejo')
        ) {
            setRegistry('gitlab');
        } else if (
            nextPlatform === 'github' &&
            (registry === 'forgejo' || registry === 'gitlab')
        ) {
            setRegistry('ghcr');
        }
        persistCiTarget(gitRemote, nextPlatform);
    }

    function handleSelectRemote(nextRemote: string) {
        setGitRemote(nextRemote);
        const matched = remotes.find((r) => r.name === nextRemote);
        const nextPlatform = matched?.platform ?? ciPlatform;
        setCiPlatform(nextPlatform);
        if (matched?.host && matched.host.includes('.')) {
            setForgejoHost(matched.host);
        }
        if (matched?.repoSlug && !currentCi?.registry?.image) {
            setImage(matched.repoSlug);
        }
        setForgejoError(null);
        setForgejoConnectedJustNow(false);
        persistCiTarget(nextRemote, nextPlatform);
    }

    const isTeaConnected = Boolean(currentCi?.teaLoggedIn);
    const showForgejoTokenForm =
        ciPlatform === 'forgejo' && (!isTeaConnected || showReconnectForgejo);
    const trimmedForgejoHost = forgejoHost.trim();

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
                    <input type="hidden" name="git_remote" value={gitRemote} />
                    <input
                        type="hidden"
                        name="ci_platform"
                        value={ciPlatform}
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

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 flex items-center justify-between text-xs font-medium text-ink">
                                <span>Git Forge Platform</span>
                                {savingTarget && (
                                    <span className="text-[10px] font-normal text-soft">
                                        Saving…
                                    </span>
                                )}
                            </label>
                            <SelectMenu
                                value={ciPlatform}
                                accent="servers"
                                disabled={processing || savingTarget}
                                triggerClassName="py-1.5 text-[13px] rounded-xl"
                                onChange={handleSelectPlatform}
                                options={[
                                    {
                                        value: 'forgejo',
                                        label: 'Forgejo / Gitea Actions',
                                        icon: (
                                            <SiForgejo className="size-3.5 text-[#FB532A]" />
                                        ),
                                    },
                                    {
                                        value: 'github',
                                        label: 'GitHub Actions',
                                        icon: (
                                            <SiGithub className="size-3.5 text-ink" />
                                        ),
                                    },
                                    {
                                        value: 'gitlab',
                                        label: 'GitLab CI',
                                        icon: (
                                            <SiGitlab className="size-3.5 text-[#FC6D26]" />
                                        ),
                                    },
                                ]}
                            />
                        </div>

                        {remotes.length > 0 && (
                            <div>
                                <label className="mb-1 block text-xs font-medium text-ink">
                                    Git Remote
                                </label>
                                <SelectMenu
                                    value={gitRemote}
                                    accent="servers"
                                    disabled={processing || savingTarget}
                                    triggerClassName="py-1.5 text-[13px] rounded-xl"
                                    onChange={handleSelectRemote}
                                    options={remotes.map((r) => ({
                                        value: r.name,
                                        label: r.name,
                                        description: r.repoSlug || r.host,
                                        icon:
                                            r.platform === 'gitlab' ? (
                                                <SiGitlab className="size-3.5 text-[#FC6D26]" />
                                            ) : r.platform === 'forgejo' ? (
                                                <SiForgejo className="size-3.5 text-[#FB532A]" />
                                            ) : (
                                                <SiGithub className="size-3.5 text-ink" />
                                            ),
                                    }))}
                                />
                            </div>
                        )}
                    </div>

                    {ciPlatform === 'forgejo' && (
                        <div className="space-y-2.5 rounded-xl border border-line bg-paper/70 px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs font-medium text-ink">
                                    <SiForgejo className="size-3.5 text-[#FB532A]" />
                                    <span>Forgejo CLI (tea)</span>
                                    {isTeaConnected ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[11px] font-medium text-ok">
                                            <CheckCircle2 className="size-3" />
                                            <span>
                                                Connected
                                                {currentCi?.teaLogin &&
                                                currentCi.teaLogin !==
                                                    trimmedForgejoHost
                                                    ? ` (${currentCi.teaLogin})`
                                                    : trimmedForgejoHost !== ''
                                                      ? ` to ${trimmedForgejoHost}`
                                                      : ''}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-warn-tint px-2 py-0.5 text-[11px] font-medium text-warn">
                                            <AlertTriangle className="size-3" />
                                            <span>Not logged in</span>
                                        </span>
                                    )}
                                </div>

                                {isTeaConnected && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            setShowReconnectForgejo(
                                                (prev) => !prev,
                                            )
                                        }
                                    >
                                        <RotateCw className="size-3" />
                                        <span>
                                            {showReconnectForgejo
                                                ? 'Hide'
                                                : 'Reconnect'}
                                        </span>
                                    </Button>
                                )}
                            </div>

                            {(currentCi?.teaLogins?.length ?? 0) > 1 && (
                                <div className="pt-0.5">
                                    <label className="mb-1 block text-[11px] font-medium text-ink">
                                        Forgejo Account (tea login)
                                    </label>
                                    <SelectMenu
                                        value={
                                            currentCi?.teaLogin ??
                                            currentCi?.teaLogins?.[0]?.name ??
                                            ''
                                        }
                                        accent="servers"
                                        disabled={processing || savingTarget}
                                        triggerClassName="py-1.5 text-xs rounded-xl"
                                        onChange={(nextLogin) => {
                                            setSavingTarget(true);
                                            router.post(
                                                configureCiRoute(project.id)
                                                    .url,
                                                {
                                                    environment,
                                                    tea_login: nextLogin,
                                                    save_target_only: true,
                                                },
                                                {
                                                    preserveScroll: true,
                                                    preserveState: true,
                                                    onFinish: () =>
                                                        setSavingTarget(false),
                                                },
                                            );
                                        }}
                                        options={(
                                            currentCi?.teaLogins ?? []
                                        ).map((login) => ({
                                            value: login.name,
                                            label: login.name,
                                            description: login.user
                                                ? `@${login.user}`
                                                : login.host,
                                        }))}
                                    />
                                </div>
                            )}

                            {forgejoConnectedJustNow && isTeaConnected && (
                                <p className="text-[11px] text-ok">
                                    Authenticated tea CLI on{' '}
                                    <span className="font-mono">
                                        {trimmedForgejoHost}
                                    </span>
                                    . You can now push secrets to Forgejo.
                                </p>
                            )}

                            {showForgejoTokenForm && (
                                <div className="space-y-2 border-t border-line/60 pt-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-soft">
                                        <span>
                                            Needs a token with{' '}
                                            <code className="font-mono text-ink">
                                                read:user
                                            </code>{' '}
                                            and{' '}
                                            <code className="font-mono text-ink">
                                                write:repository
                                            </code>{' '}
                                            scopes to connect and push secrets
                                            via{' '}
                                            <code className="font-mono text-ink">
                                                tea
                                            </code>
                                            .
                                        </span>
                                        {trimmedForgejoHost !== '' && (
                                            <ExternalLinkButton
                                                url={`https://${trimmedForgejoHost}/user/settings/applications`}
                                                showIcon
                                                className="inline-flex cursor-pointer items-center gap-1 font-medium text-brand hover:underline"
                                            >
                                                <span>
                                                    Create token on{' '}
                                                    {trimmedForgejoHost}
                                                </span>
                                            </ExternalLinkButton>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                                        <input
                                            type="text"
                                            value={forgejoHost}
                                            onChange={(e) => {
                                                setForgejoHost(e.target.value);
                                                setForgejoError(null);
                                            }}
                                            disabled={
                                                connectingForgejo || processing
                                            }
                                            placeholder="git.example.com"
                                            className="w-full rounded-xl border-0 bg-surface px-2.5 py-1.5 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-servers sm:col-span-2"
                                        />
                                        <div className="flex items-center gap-2 sm:col-span-3">
                                            <input
                                                type="password"
                                                value={forgejoToken}
                                                onChange={(e) => {
                                                    setForgejoToken(
                                                        e.target.value,
                                                    );
                                                    setForgejoError(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleConnectForgejo();
                                                    }
                                                }}
                                                disabled={
                                                    connectingForgejo ||
                                                    processing
                                                }
                                                placeholder="Paste Forgejo access token…"
                                                className="min-w-0 flex-1 rounded-xl border-0 bg-surface px-2.5 py-1.5 font-mono text-xs ring-1 ring-line outline-none focus:ring-2 focus:ring-servers"
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                disabled={
                                                    connectingForgejo ||
                                                    processing
                                                }
                                                onClick={handleConnectForgejo}
                                            >
                                                {connectingForgejo ? (
                                                    <RotateCw className="size-3 animate-spin" />
                                                ) : (
                                                    <Key className="size-3" />
                                                )}
                                                <span>
                                                    {connectingForgejo
                                                        ? 'Connecting…'
                                                        : 'Connect'}
                                                </span>
                                            </Button>
                                        </div>
                                    </div>

                                    {(forgejoError ??
                                        errors.git_login_token) && (
                                        <p className="text-xs text-accent">
                                            {forgejoError ??
                                                errors.git_login_token}
                                        </p>
                                    )}
                                </div>
                            )}
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
    activePlex = [],
    activeManaged = [],
    initialSection = 'server',
    onSuccess,
}: EnvironmentSettingsDrawerProps) {
    const [slidIn, setSlidIn] = useState(false);
    const [highlightedSection, setHighlightedSection] =
        useState<EnvironmentSettingsDrawerSection | null>(null);

    const [showRotateConfirm, setShowRotateConfirm] = useState(false);
    const [selectedPlex, setSelectedPlex] = useState<string[]>(activePlex);

    const eligibleServices = useMemo(
        () => eligibleBackingServices(project),
        [project],
    );
    const activeServerPlex = useMemo(
        () =>
            readyServers.find(
                (candidate) => candidate.name === activeServer?.name,
            )?.plex ?? null,
        [readyServers, activeServer?.name],
    );

    const plexSignature = activePlex.join(',');
    useEffect(() => {
        if (isOpen) {
            setSelectedPlex(activePlex);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, environment, plexSignature]);

    const plexDirty = useMemo(() => {
        const a = [...selectedPlex].sort().join(',');
        const b = [...activePlex].sort().join(',');
        return a !== b;
    }, [selectedPlex, activePlex]);

    const connectedPlex = useMemo(
        () => activePlex.filter((slug) => activeManaged.includes(slug)),
        [activePlex, activeManaged],
    );
    const pendingPlex = useMemo(
        () => activePlex.filter((slug) => !activeManaged.includes(slug)),
        [activePlex, activeManaged],
    );
    const externalManaged = useMemo(
        () => activeManaged.filter((slug) => !activePlex.includes(slug)),
        [activePlex, activeManaged],
    );
    const [externalServices, setExternalServices] =
        useState<string[]>(externalManaged);

    const serverRef = useRef<HTMLDivElement>(null);
    const addressRef = useRef<HTMLDivElement>(null);
    const servicesRef = useRef<HTMLDivElement>(null);
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
                services: servicesRef.current,
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
            services: servicesRef.current,
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
                    {eligibleServices.length > 0 && (
                        <button
                            type="button"
                            onClick={() => scrollToSection('services')}
                            className={cn(
                                'inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition',
                                highlightedSection === 'services'
                                    ? 'bg-brand/10 text-brand'
                                    : 'text-soft hover:bg-surface hover:text-ink',
                            )}
                        >
                            <Database className="size-3" />
                            <span>Backing Services</span>
                        </button>
                    )}
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

                    {/* Section 3: Backing Services */}
                    {eligibleServices.length > 0 && (
                        <div
                            ref={servicesRef}
                            className={cn(
                                'rounded-2xl border border-line bg-paper/40 p-5 transition-all duration-700',
                                highlightedSection === 'services'
                                    ? 'bg-brand/5 shadow-md ring-2 ring-brand/60'
                                    : 'ring-0',
                            )}
                        >
                            <div className="mb-4 flex items-center justify-between border-b border-line/60 pb-3">
                                <div className="flex items-center gap-2">
                                    <Database className="size-4 text-brand" />
                                    <h3 className="text-sm font-semibold text-ink">
                                        Backing Services
                                    </h3>
                                </div>
                                <span className="rounded-full bg-line/60 px-2 py-0.5 text-[10px] font-semibold text-soft uppercase">
                                    Pods vs Plex Commons
                                </span>
                            </div>

                            <Form
                                action={backingServicesRoute(project.id)}
                                className="space-y-3"
                                onSuccess={onSuccess}
                            >
                                {({ errors, processing }) => (
                                    <>
                                        <input
                                            type="hidden"
                                            name="environment"
                                            value={environment}
                                        />
                                        <BackingServicesPicker
                                            project={project}
                                            environment={environment}
                                            selected={selectedPlex}
                                            onChange={setSelectedPlex}
                                            external={externalServices}
                                            onExternalChange={
                                                setExternalServices
                                            }
                                            serverName={activeServer?.name}
                                            serverPlex={activeServerPlex}
                                            connectedPlex={connectedPlex}
                                            pendingPlex={pendingPlex}
                                            externalManaged={externalManaged}
                                            disabled={
                                                !project.initialized ||
                                                processing
                                            }
                                        />
                                        {errors.plex && (
                                            <p className="text-xs text-accent">
                                                {errors.plex}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-between gap-3 pt-1">
                                            <p className="text-[11px] text-soft">
                                                Updates manifests now; cluster
                                                Plex services provision on next
                                                deploy or CI setup.
                                            </p>
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={
                                                    !project.initialized ||
                                                    processing ||
                                                    !plexDirty
                                                }
                                            >
                                                {processing ? (
                                                    <RotateCw className="size-3 animate-spin" />
                                                ) : (
                                                    <Save className="size-3" />
                                                )}
                                                <span>
                                                    {processing
                                                        ? 'Saving…'
                                                        : 'Save Backing Services'}
                                                </span>
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </Form>
                        </div>
                    )}

                    {/* Section 4: Delivery Pipeline & CI/CD */}
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
                                        options={{
                                            preserveScroll: true,
                                            preserveState: true,
                                        }}
                                        onFinish={() =>
                                            setShowRotateConfirm(false)
                                        }
                                    >
                                        {({ processing }) => (
                                            <>
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
                                                        disabled={processing}
                                                    >
                                                        <RotateCw
                                                            className={cn(
                                                                'size-3',
                                                                processing &&
                                                                    'animate-spin',
                                                            )}
                                                        />
                                                        <span>
                                                            {processing
                                                                ? 'Rotating…'
                                                                : 'Confirm Rotate'}
                                                        </span>
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        disabled={processing}
                                                        onClick={() =>
                                                            setShowRotateConfirm(
                                                                false,
                                                            )
                                                        }
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </>
                                        )}
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
