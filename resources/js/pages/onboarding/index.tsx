import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Head, router } from '@inertiajs/react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import {
    ArrowRight,
    Check,
    Cloud,
    Download,
    Globe,
    PartyPopper,
    Rocket,
    Server,
    Sparkles,
    Wrench,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import ProviderLogo from '@/components/provider-logo';
import ToolLogo from '@/components/tool-logo';
import FrameworkLogo from '@/components/framework-logo';
import { cn } from '@/lib/utils';
import CliMissing from '@/components/setup/cli-missing';
import UsageChoice from '@/components/setup/usage-choice';
import ToolCatalogList, {
    type CatalogEntry,
} from '@/components/setup/tool-catalog';
import WslCheck, { type WslState } from '@/components/setup/wsl-check';
import { useToolStatus } from '@/lib/tool-status';

type Props = {
    windows: boolean;
    wsl?: WslState | null;
    usage: 'tools' | 'apps' | null;
    intendedProviders: string[];
    cloudProviders: Record<string, string>;
    catalog: CatalogEntry[];
    cliInstallCommand: string;
    cliChannel?: string;
};

const PROVIDER_HINTS: Record<string, string> = {
    do: 'Just an API token — no CLI to install.',
    hetzner: 'Just an API token — no CLI to install.',
    gcp: 'Needs the Google Cloud CLI and a quick sign-in.',
    aws: 'Needs the AWS CLI, or an access key pair.',
};

// The same four hues as the logo's cubes (resources/css/app.css's
// --color-brand/setup/servers/tools), plus ok-green for Done — so the wizard
// reads as one continuous brand gradient from step to step, not five greys.
const STEP_META = [
    {
        id: 'welcome',
        short: 'Welcome',
        icon: Sparkles,
        tint: 'bg-brand/10 text-brand',
        solid: 'bg-brand text-white',
        hex: '#5683e0',
    },
    {
        id: 'persona',
        short: 'What you need',
        icon: Wrench,
        tint: 'bg-tools/10 text-tools',
        solid: 'bg-tools text-white',
        hex: '#8457e0',
    },
    {
        id: 'providers',
        short: 'Where to',
        icon: Cloud,
        tint: 'bg-servers/10 text-servers',
        solid: 'bg-servers text-white',
        hex: '#2c9fc0',
    },
    {
        id: 'install',
        short: 'Install',
        icon: Download,
        tint: 'bg-setup/10 text-setup',
        solid: 'bg-setup text-white',
        hex: '#d6412d',
    },
    {
        id: 'done',
        short: 'Done',
        icon: PartyPopper,
        tint: 'bg-ok/10 text-ok',
        solid: 'bg-ok text-white',
        hex: '#15803d',
    },
] as const;

const WHAT_YOU_GET = [
    {
        icon: Server,
        label: 'Provision servers',
        tint: 'bg-servers/10 text-servers',
    },
    {
        icon: Wrench,
        label: 'Install Cluster Tools',
        tint: 'bg-tools/10 text-tools',
    },
    { icon: Rocket, label: 'Deploy your apps', tint: 'bg-brand/10 text-brand' },
] as const;

// Brand icons only — no names, taglines, or categories — purely to show the
// breadth of what's installable. Mirrors every case tool-logo.tsx/
// framework-logo.tsx already draw a real brand icon for. Static on purpose:
// the Welcome step has to render before the LaraKube CLI is even installed,
// so a CLI-sourced catalog can't reach this screen.
const TOOL_LOGO_WALL = [
    'pocketbase',
    'directus',
    'wordpress',
    'matrix',
    'openbao',
    'twenty',
    'livekit',
    'kuma',
    'vaultwarden',
    'forgejo',
    'gitea',
    'grafana',
    'prometheus',
    'minio',
    'ocis',
    'n8n',
    'windmill',
    'metabase',
    'outline',
    'chatwoot',
    'umami',
    'plausible',
    'glitchtip',
    'netbird',
    'wireguard',
    'zitadel',
    'stalwart',
    'teable',
    'documenso',
    'traefik',
    'headlamp',
    'penpot',
    'resume',
    'yopass',
    'external-dns',
    'planka',
    'kutt',
    'sendrec',
    'bulwark',
    'redis',
    'postgresql',
    'mysql',
    'mariadb',
    'mongodb',
    'adminer',
];

const FRAMEWORK_LOGO_WALL = [
    'laravel',
    'statamic',
    'wordpress',
    'nextjs',
    'vite',
    'astro',
    'docusaurus',
    'django',
    'fastapi',
    'nestjs',
    'adonisjs',
    'springboot',
    'dotnet',
    'go',
    'rust',
];

const ALL_LOGO_SLUGS = [...TOOL_LOGO_WALL, ...FRAMEWORK_LOGO_WALL];

function rotated(list: string[], offset: number): string[] {
    const n = offset % list.length;

    return [...list.slice(n), ...list.slice(0, n)];
}

// Five differently-offset views of the same pool, so each row shows a
// different mix rather than all scrolling the identical sequence.
const BACKGROUND_WALL_ROWS = [0, 12, 24, 36, 48].map((offset) =>
    rotated(ALL_LOGO_SLUGS, offset),
);

/** The full-screen, grayscale, slow-drifting logo wall behind the card — present on every step, not just Welcome. */
function BackgroundLogoWall() {
    return (
        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col justify-around gap-8 overflow-hidden py-4 opacity-[0.16] grayscale">
            {BACKGROUND_WALL_ROWS.map((items, idx) => (
                <LogoMarquee
                    key={idx}
                    items={items}
                    reverse={idx % 2 === 1}
                    duration={52 + idx * 9}
                    renderItem={(slug) =>
                        TOOL_LOGO_WALL.includes(slug) ? (
                            <ToolLogo slug={slug} size="lg" />
                        ) : (
                            <FrameworkLogo slug={slug} size="lg" />
                        )
                    }
                />
            ))}
        </div>
    );
}

/** An infinitely-looping row of logos, faded at both edges. Duplicates `items` once so the loop seams invisibly. */
function LogoMarquee({
    items,
    renderItem,
    reverse = false,
    duration = 32,
}: {
    items: string[];
    renderItem: (slug: string) => ReactNode;
    reverse?: boolean;
    duration?: number;
}) {
    const track = [...items, ...items];

    return (
        <div
            className="relative overflow-hidden py-1"
            style={{
                maskImage:
                    'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
                WebkitMaskImage:
                    'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
            }}
        >
            <motion.div
                className="flex w-max items-center gap-5"
                animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
                transition={{ duration, repeat: Infinity, ease: 'linear' }}
            >
                {track.map((slug, idx) => (
                    <div key={`${slug}-${idx}`}>{renderItem(slug)}</div>
                ))}
            </motion.div>
        </div>
    );
}

const stepVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 32 : -32,
        opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
        x: direction > 0 ? -32 : 32,
        opacity: 0,
    }),
};

const fadeUpContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const fadeUpItem = {
    hidden: { opacity: 0, y: 10 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.35, ease: 'easeOut' as const },
    },
};

export default function OnboardingIndex({
    windows,
    wsl,
    usage,
    intendedProviders,
    cloudProviders,
    catalog,
    cliInstallCommand,
    cliChannel = 'canary',
}: Props) {
    const [currentStep, setCurrentStep] = useState(1);
    const [highestReachedStep, setHighestReachedStep] = useState(1);
    const [selectedProviders, setSelectedProviders] =
        useState<string[]>(intendedProviders);
    const [savingProviders, setSavingProviders] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [selectedChannel, setSelectedChannel] = useState(cliChannel);
    const [finishing, setFinishing] = useState(false);
    const direction = useRef(1);
    const celebrated = useRef(false);

    const cli = useToolStatus('larakube', refresh);
    const cliMissing = cli.status?.installed === false;
    const active = STEP_META[currentStep - 1];

    const goTo = (step: number) => {
        direction.current = step >= currentStep ? 1 : -1;
        setCurrentStep(step);
        setHighestReachedStep((current) => Math.max(current, step));
    };

    useEffect(() => {
        if (currentStep !== 5 || celebrated.current) {
            return;
        }
        celebrated.current = true;
        void confetti({
            particleCount: 90,
            spread: 70,
            startVelocity: 32,
            origin: { y: 0.6 },
            colors: ['#5683e0', '#2c9fc0', '#8457e0', '#15803d'],
        });
    }, [currentStep]);

    const toggleProvider = (slug: string) => {
        setSelectedProviders((current) =>
            current.includes(slug)
                ? current.filter((p) => p !== slug)
                : [...current, slug],
        );
    };

    const saveProvidersAndContinue = (
        providers: string[] = selectedProviders,
    ) => {
        setSavingProviders(true);
        router.post(
            '/onboarding/providers',
            { providers },
            {
                preserveScroll: true,
                onSuccess: () => goTo(4),
                onFinish: () => setSavingProviders(false),
            },
        );
    };

    const finish = () => {
        setFinishing(true);
        router.post(
            '/onboarding/complete',
            {},
            { onFinish: () => setFinishing(false) },
        );
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-4 py-10">
            <Head title="Welcome to LaraKube" />

            {/* The moving logo wall sits behind everything else, then a color wash over it, then the card on top. */}
            <BackgroundLogoWall />

            {/* Ambient background glows — the same hues as the stepper and the logo */}
            <div className="pointer-events-none absolute -top-32 -left-24 z-0 size-96 animate-pulse rounded-full bg-brand/10 blur-3xl" />
            <div
                className="pointer-events-none absolute top-1/3 -right-24 z-0 size-96 animate-pulse rounded-full bg-tools/10 blur-3xl"
                style={{ animationDelay: '1s' }}
            />
            <div
                className="pointer-events-none absolute -bottom-32 left-1/3 z-0 size-96 animate-pulse rounded-full bg-servers/10 blur-3xl"
                style={{ animationDelay: '2s' }}
            />

            <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-xl ring-1 ring-line"
            >
                {/* Header */}
                <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
                    <img
                        src="/logo.png"
                        alt="LaraKube"
                        className="size-8 rounded-lg shadow-2xs"
                    />
                    <div>
                        <h1 className="text-sm font-semibold tracking-tight">
                            LaraKube Desktop
                        </h1>
                        <p className="text-xs text-soft">
                            Step {currentStep} of {STEP_META.length}
                        </p>
                    </div>
                </div>

                {/* Progress */}
                <div className="border-b border-line/70 bg-paper/60 px-6 py-3">
                    <nav
                        aria-label="Onboarding progress"
                        className="flex items-center justify-between"
                    >
                        {STEP_META.map((step, idx) => {
                            const stepNum = idx + 1;
                            const isCompleted = stepNum < currentStep;
                            const isCurrent = stepNum === currentStep;
                            const isClickable = stepNum <= highestReachedStep;
                            const Icon = step.icon;

                            return (
                                <button
                                    key={step.id}
                                    type="button"
                                    disabled={!isClickable}
                                    onClick={() => isClickable && goTo(stepNum)}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-1 text-[10px] font-medium transition sm:flex-row sm:gap-3.5',
                                        isCurrent
                                            ? 'text-ink'
                                            : isCompleted
                                              ? 'cursor-pointer text-soft hover:text-ink'
                                              : 'cursor-not-allowed text-faint',
                                    )}
                                >
                                    <motion.span
                                        layout
                                        animate={{
                                            scale: isCurrent ? 1.15 : 1,
                                            boxShadow: isCurrent
                                                ? `0 0 0 4px ${active.hex}22`
                                                : '0 0 0 0px transparent',
                                        }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 300,
                                            damping: 18,
                                        }}
                                        className={cn(
                                            'flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full transition-colors',
                                            isCurrent
                                                ? step.solid
                                                : isCompleted
                                                  ? 'bg-ok text-white'
                                                  : 'bg-badge text-faint',
                                        )}
                                    >
                                        <AnimatePresence
                                            mode="popLayout"
                                            initial={false}
                                        >
                                            <motion.span
                                                key={
                                                    isCompleted
                                                        ? 'check'
                                                        : step.id
                                                }
                                                initial={{
                                                    scale: 0,
                                                    rotate: -45,
                                                    opacity: 0,
                                                }}
                                                animate={{
                                                    scale: 1,
                                                    rotate: 0,
                                                    opacity: 1,
                                                }}
                                                exit={{ scale: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="flex items-center justify-center"
                                            >
                                                {isCompleted ? (
                                                    <Check className="size-3.5" />
                                                ) : (
                                                    <Icon className="size-3.5" />
                                                )}
                                            </motion.span>
                                        </AnimatePresence>
                                    </motion.span>
                                    <span className="hidden sm:inline">
                                        {step.short}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Body */}
                <div className="max-h-[60vh] overflow-y-auto p-6">
                    <AnimatePresence
                        mode="wait"
                        custom={direction.current}
                        initial={false}
                    >
                        <motion.div
                            key={currentStep}
                            custom={direction.current}
                            variants={stepVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                        >
                            {currentStep === 1 && (
                                <motion.div
                                    variants={fadeUpContainer}
                                    initial="hidden"
                                    animate="visible"
                                    className="space-y-5 text-center"
                                >
                                    <motion.div
                                        variants={fadeUpItem}
                                        className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-paper shadow-2xs ring-1 ring-line/80"
                                    >
                                        <div className="grid grid-cols-2 gap-1 p-2">
                                            {[
                                                '#5683e0',
                                                '#d6412d',
                                                '#2c9fc0',
                                                '#8457e0',
                                            ].map((color, idx) => (
                                                <motion.div
                                                    key={color}
                                                    className="size-4.5 rounded-xs shadow-2xs"
                                                    style={{
                                                        backgroundColor: color,
                                                    }}
                                                    animate={{
                                                        y: [0, -4, 0],
                                                    }}
                                                    transition={{
                                                        duration: 1.6,
                                                        repeat: Infinity,
                                                        ease: 'easeInOut',
                                                        delay: idx * 0.15,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </motion.div>
                                    <motion.h2
                                        variants={fadeUpItem}
                                        className="text-lg font-semibold text-ink"
                                    >
                                        Welcome to LaraKube Desktop
                                    </motion.h2>
                                    <motion.p
                                        variants={fadeUpItem}
                                        className="mx-auto max-w-md text-sm leading-relaxed text-soft"
                                    >
                                        LaraKube provisions servers, installs
                                        production-grade Cluster Tools (chat, a
                                        wiki, sign-in, backups, and more), and
                                        can deploy your own Laravel apps — all
                                        from this app. A couple of quick
                                        questions first, so we only ask for what
                                        you actually need.
                                    </motion.p>
                                    <motion.div
                                        variants={fadeUpItem}
                                        className="flex flex-wrap items-center justify-center gap-2.5 pt-1"
                                    >
                                        {WHAT_YOU_GET.map(
                                            ({ icon: Icon, label, tint }) => (
                                                <span
                                                    key={label}
                                                    className="flex items-center gap-1.5 rounded-full bg-paper py-1.5 pr-3 pl-1.5 text-xs font-medium text-ink ring-1 ring-line"
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex size-5.5 items-center justify-center rounded-full',
                                                            tint,
                                                        )}
                                                    >
                                                        <Icon className="size-3" />
                                                    </span>
                                                    {label}
                                                </span>
                                            ),
                                        )}
                                    </motion.div>

                                    <motion.p
                                        variants={fadeUpItem}
                                        className="pt-1 text-[11px] font-medium text-faint"
                                    >
                                        {TOOL_LOGO_WALL.length}+ Cluster Tools
                                        and {FRAMEWORK_LOGO_WALL.length}+
                                        frameworks — and growing
                                    </motion.p>
                                </motion.div>
                            )}

                            {currentStep === 2 && (
                                <div className="space-y-1">
                                    <UsageChoice
                                        usage={usage}
                                        prompt="What will you use LaraKube Desktop for?"
                                    />
                                    <p className="text-xs leading-relaxed text-soft">
                                        This decides what shows up in the
                                        sidebar — you can change it later in
                                        Settings.
                                    </p>
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-3">
                                    <p className="text-sm font-medium">
                                        Where do you plan to deploy?
                                    </p>
                                    <p className="text-xs text-soft">
                                        Pick as many as you like. We'll only ask
                                        you to install the command-line tools
                                        each one actually needs. Not sure yet?
                                        Skip this and we'll show you everything.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {Object.entries(cloudProviders).map(
                                            ([slug, label]) => {
                                                const selected =
                                                    selectedProviders.includes(
                                                        slug,
                                                    );

                                                return (
                                                    <motion.button
                                                        key={slug}
                                                        type="button"
                                                        whileHover={{
                                                            scale: 1.02,
                                                        }}
                                                        whileTap={{
                                                            scale: 0.97,
                                                        }}
                                                        onClick={() =>
                                                            toggleProvider(slug)
                                                        }
                                                        className={cn(
                                                            'flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-colors',
                                                            selected
                                                                ? 'border-accent bg-accent-tint'
                                                                : 'border-line bg-surface hover:border-faint hover:bg-paper',
                                                        )}
                                                    >
                                                        <span className="relative shrink-0">
                                                            <ProviderLogo
                                                                slug={slug}
                                                                size="sm"
                                                            />
                                                            <AnimatePresence>
                                                                {selected && (
                                                                    <motion.span
                                                                        initial={{
                                                                            scale: 0,
                                                                            opacity: 0,
                                                                        }}
                                                                        animate={{
                                                                            scale: 1,
                                                                            opacity: 1,
                                                                        }}
                                                                        exit={{
                                                                            scale: 0,
                                                                            opacity: 0,
                                                                        }}
                                                                        transition={{
                                                                            type: 'spring',
                                                                            stiffness: 400,
                                                                            damping: 22,
                                                                        }}
                                                                        className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-ok text-white ring-2 ring-surface"
                                                                    >
                                                                        <Check className="size-2.5" />
                                                                    </motion.span>
                                                                )}
                                                            </AnimatePresence>
                                                        </span>
                                                        <span>
                                                            <span className="block text-sm font-semibold">
                                                                {label}
                                                            </span>
                                                            <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                                                {PROVIDER_HINTS[
                                                                    slug
                                                                ] ?? ''}
                                                            </span>
                                                        </span>
                                                    </motion.button>
                                                );
                                            },
                                        )}
                                    </div>
                                </div>
                            )}

                            {currentStep === 4 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium">
                                            Install what you need
                                        </p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                setRefresh((count) => count + 1)
                                            }
                                        >
                                            Check again
                                        </Button>
                                    </div>
                                    {selectedProviders.length > 0 && (
                                        <p className="flex flex-wrap items-center gap-1.5 text-xs leading-relaxed text-soft">
                                            <span>You picked</span>
                                            {selectedProviders.map(
                                                (slug, i) => (
                                                    <span
                                                        key={slug}
                                                        className="contents"
                                                    >
                                                        {i > 0 && (
                                                            <span>
                                                                {i ===
                                                                selectedProviders.length -
                                                                    1
                                                                    ? 'and'
                                                                    : ','}
                                                            </span>
                                                        )}
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-paper py-0.5 pr-2 pl-0.5 font-medium text-ink ring-1 ring-line">
                                                            <ProviderLogo
                                                                slug={slug}
                                                                size="xs"
                                                            />
                                                            {
                                                                cloudProviders[
                                                                    slug
                                                                ]
                                                            }
                                                        </span>
                                                    </span>
                                                ),
                                            )}
                                            <span>
                                                — that's all we're asking for
                                                below, no other cloud CLI
                                                required.
                                            </span>
                                        </p>
                                    )}
                                    {windows &&
                                    (!wsl || wsl.state !== 'ready') ? (
                                        <WslCheck wsl={wsl} />
                                    ) : cliMissing ? (
                                        <CliMissing
                                            windows={windows}
                                            diagnostic={
                                                cli.status?.diagnostic ?? null
                                            }
                                            command={cliInstallCommand}
                                            channel={selectedChannel}
                                            onChannelChange={setSelectedChannel}
                                        />
                                    ) : (
                                        <Card label="Command-line tools">
                                            <ToolCatalogList
                                                catalog={catalog}
                                                channel={selectedChannel}
                                                refresh={refresh}
                                                showLocalOnly={usage === 'apps'}
                                            />
                                        </Card>
                                    )}
                                </div>
                            )}

                            {currentStep === 5 && (
                                <div className="space-y-4 text-center">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -15 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 260,
                                            damping: 18,
                                        }}
                                        className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-ok/10 text-ok"
                                    >
                                        <PartyPopper className="size-8" />
                                    </motion.div>
                                    <motion.h2
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="text-lg font-semibold text-ink"
                                    >
                                        You're all set
                                    </motion.h2>
                                    <motion.p
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.18 }}
                                        className="mx-auto max-w-md text-sm leading-relaxed text-soft"
                                    >
                                        You can always revisit what LaraKube
                                        Desktop is for, which providers you use,
                                        and which tools are installed from Setup
                                        and Settings.
                                    </motion.p>
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.26 }}
                                        className="flex flex-wrap items-center justify-center gap-2 pt-1"
                                    >
                                        <span className="flex items-center gap-1.5 rounded-full bg-paper py-1.5 pr-3 pl-1.5 text-xs font-medium text-ink ring-1 ring-line">
                                            <span
                                                className={cn(
                                                    'flex size-5.5 items-center justify-center rounded-full',
                                                    usage === 'apps'
                                                        ? 'bg-brand/10 text-brand'
                                                        : 'bg-tools/10 text-tools',
                                                )}
                                            >
                                                {usage === 'apps' ? (
                                                    <Rocket className="size-3" />
                                                ) : (
                                                    <Wrench className="size-3" />
                                                )}
                                            </span>
                                            {usage === 'apps'
                                                ? 'Build and run apps here'
                                                : 'Install tools on a server'}
                                        </span>
                                        {selectedProviders.length > 0 ? (
                                            selectedProviders.map((slug) => (
                                                <span
                                                    key={slug}
                                                    className="flex items-center gap-1.5 rounded-full bg-paper py-1.5 pr-3 pl-1.5 text-xs font-medium text-ink ring-1 ring-line"
                                                >
                                                    <ProviderLogo
                                                        slug={slug}
                                                        size="xs"
                                                    />
                                                    {cloudProviders[slug]}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="flex items-center gap-1.5 rounded-full bg-paper py-1.5 pr-3 pl-1.5 text-xs font-medium text-ink ring-1 ring-line">
                                                <span className="flex size-5.5 items-center justify-center rounded-full bg-servers/10 text-servers">
                                                    <Globe className="size-3" />
                                                </span>
                                                Every provider shown
                                            </span>
                                        )}
                                    </motion.div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-line px-6 py-4">
                    <div>
                        {currentStep > 1 && currentStep < 5 && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => goTo(currentStep - 1)}
                            >
                                Back
                            </Button>
                        )}
                    </div>
                    <div>
                        {currentStep === 1 && (
                            <Button type="button" onClick={() => goTo(2)}>
                                <Rocket className="size-4" />
                                <span>Get started</span>
                            </Button>
                        )}
                        {currentStep === 2 && (
                            <Button
                                type="button"
                                disabled={usage === null}
                                onClick={() => goTo(3)}
                            >
                                <span>Continue</span>
                                <ArrowRight className="size-4" />
                            </Button>
                        )}
                        {currentStep === 3 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={savingProviders}
                                    onClick={() => {
                                        setSelectedProviders([]);
                                        saveProvidersAndContinue([]);
                                    }}
                                >
                                    <Globe className="size-4" />
                                    <span>
                                        Not sure yet, show me everything
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    disabled={savingProviders}
                                    onClick={() => saveProvidersAndContinue()}
                                >
                                    <Cloud className="size-4" />
                                    <span>Continue</span>
                                </Button>
                            </div>
                        )}
                        {currentStep === 4 && (
                            <Button type="button" onClick={() => goTo(5)}>
                                <span>Continue</span>
                                <ArrowRight className="size-4" />
                            </Button>
                        )}
                        {currentStep === 5 && (
                            <Button
                                type="button"
                                disabled={finishing}
                                onClick={finish}
                            >
                                <Sparkles className="size-4" />
                                <span>
                                    {finishing
                                        ? 'Entering…'
                                        : 'Enter LaraKube Desktop'}
                                </span>
                            </Button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
