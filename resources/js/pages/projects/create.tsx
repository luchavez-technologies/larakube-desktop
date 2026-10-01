import { Deferred, Link, router, useForm, usePoll } from '@inertiajs/react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronDown,
    ExternalLink,
    Search,
    Terminal,
    X,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import FrameworkLogo from '@/components/framework-logo';
import LaravelOptions, {
    defaultAnswers,
    reconcile,
} from '@/components/laravel-options';
import LogPanel from '@/components/log-panel';
import PageHeader from '@/components/page-header';
import StatusPill, { type Tone } from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { chooseFolder, create, index, scaffold, show } from '@/routes/projects';
import { cancel, show as showRun } from '@/routes/runs';
import type { NewAppAnswers, NewAppQuestion } from '@/types/larakube';

type Framework = {
    label: string;
    description: string;
    category: string;
    comingSoon?: boolean;
};

const CATEGORIES: { id: string; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'cms', label: 'CMS' },
    { id: 'fullstack', label: 'Full Stack' },
    { id: 'frontend', label: 'Frontend' },
    { id: 'docs', label: 'Docs' },
];

const FRAMEWORK_META: Record<string, { tech: string; keywords: string[] }> = {
    laravel: {
        tech: 'PHP',
        keywords: ['php', 'fullstack', 'artisan', 'blade', 'eloquent'],
    },
    statamic: {
        tech: 'PHP',
        keywords: ['php', 'cms', 'flat-file', 'laravel', 'content'],
    },
    wordpress: {
        tech: 'PHP',
        keywords: ['php', 'cms', 'bedrock', 'roots', 'blog', 'wordpress'],
    },
    emdash: {
        tech: 'Astro',
        keywords: [
            'astro',
            'typescript',
            'cms',
            'publishing',
            'blog',
            'content',
        ],
    },
    nextjs: {
        tech: 'React',
        keywords: [
            'react',
            'typescript',
            'javascript',
            'ssr',
            'fullstack',
            'next',
        ],
    },
    django: {
        tech: 'Python',
        keywords: ['python', 'fullstack', 'orm', 'django'],
    },
    fastapi: {
        tech: 'Python',
        keywords: ['python', 'api', 'rest', 'pydantic', 'async'],
    },
    nestjs: {
        tech: 'Node',
        keywords: [
            'typescript',
            'node',
            'nodejs',
            'backend',
            'express',
            'nest',
        ],
    },
    adonisjs: {
        tech: 'Node',
        keywords: [
            'typescript',
            'node',
            'nodejs',
            'mvc',
            'fullstack',
            'adonis',
        ],
    },
    springboot: {
        tech: 'Java',
        keywords: ['java', 'spring', 'jvm', 'enterprise', 'backend'],
    },
    dotnet: {
        tech: '.NET',
        keywords: ['c#', 'csharp', 'dotnet', '.net', 'microsoft'],
    },
    gin: {
        tech: 'Go',
        keywords: ['go', 'golang', 'api', 'microservice'],
    },
    axum: {
        tech: 'Rust',
        keywords: ['rust', 'tokio', 'async', 'performance'],
    },
    vite: {
        tech: 'React',
        keywords: ['react', 'frontend', 'spa', 'vite', 'typescript'],
    },
    astro: {
        tech: 'Astro',
        keywords: ['astro', 'frontend', 'content', 'static', 'ssg'],
    },
    docusaurus: {
        tech: 'Docs',
        keywords: ['react', 'docs', 'documentation', 'markdown', 'mdx'],
    },
};

function categoryBadgeLabel(cat: string): string {
    switch (cat) {
        case 'cms':
            return 'CMS';
        case 'fullstack':
            return 'Full Stack';
        case 'frontend':
            return 'Frontend';
        case 'docs':
            return 'Docs';
        default:
            return cat;
    }
}

const inputClass =
    'w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand';

type ActiveRun = {
    id: number;
    label: string;
    kind?: string;
    status: string;
    output: string;
    startedAt?: string;
    finishedAt?: string;
    meta?: Record<string, any>;
};

export default function CreateProject({
    frameworks,
    parent,
    name,
    framework,
    email,
    laravelOptions,
    activeRun,
}: {
    frameworks: Record<string, Framework>;
    parent: string;
    name: string;
    framework: string;
    email: string;
    laravelOptions?: NewAppQuestion[] | null;
    activeRun?: ActiveRun | null;
}) {
    const form = useForm<{
        name: string;
        framework: string;
        parent: string;
        email: string;
        laravel: NewAppAnswers;
    }>({ name, framework, parent, email, laravel: {} });
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const isRunRunning = activeRun?.status === 'running';

    const { start, stop } = usePoll(
        1000,
        { only: ['activeRun'] },
        { autoStart: isRunRunning },
    );

    useEffect(() => {
        if (isRunRunning) {
            start();
        } else {
            stop();
        }
    }, [isRunRunning, start, stop]);

    const elapsedText = useMemo(() => {
        if (!activeRun?.startedAt) return '';
        const end = activeRun.finishedAt
            ? new Date(activeRun.finishedAt)
            : new Date();
        const seconds = Math.max(
            0,
            Math.round(
                (end.getTime() - new Date(activeRun.startedAt).getTime()) /
                    1000,
            ),
        );
        return seconds >= 60
            ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
            : `${seconds}s`;
    }, [activeRun]);

    const [statusLabel, statusTone]: [string, Tone] = activeRun
        ? (runStatus[activeRun.status as keyof typeof runStatus] ?? [
              'Running',
              'busy',
          ])
        : ['Ready', 'muted'];

    const isLaravel = form.data.framework === 'laravel';
    const isStatamic = form.data.framework === 'statamic';
    const needsEmail = isLaravel || isStatamic;
    const { setData } = form;

    const filteredFrameworks = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return Object.entries(frameworks).filter(([slug, option]) => {
            const matchesCat =
                selectedCategory === 'all' ||
                option.category === selectedCategory;
            if (!matchesCat) return false;

            if (!query) return true;

            const meta = FRAMEWORK_META[slug];
            const matchesBasic =
                slug.toLowerCase().includes(query) ||
                option.label.toLowerCase().includes(query) ||
                option.description.toLowerCase().includes(query) ||
                option.category.toLowerCase().includes(query);

            const matchesMeta =
                meta &&
                (meta.tech.toLowerCase().includes(query) ||
                    meta.keywords.some((kw) => kw.includes(query)));

            return matchesBasic || Boolean(matchesMeta);
        });
    }, [frameworks, selectedCategory, searchQuery]);

    const selectedOption = frameworks[form.data.framework] ?? {
        label: form.data.framework,
        description: '',
        category: 'fullstack',
    };

    const listRef = useRef<HTMLDivElement>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);

    const checkScroll = () => {
        const el = listRef.current;
        if (!el) return;
        setCanScrollUp(el.scrollTop > 8);
        setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
    };

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;

        checkScroll();
        const observer = new ResizeObserver(checkScroll);
        observer.observe(el);

        return () => observer.disconnect();
    }, [filteredFrameworks]);

    const maskStyle: CSSProperties = useMemo(() => {
        if (canScrollUp && canScrollDown) {
            return {
                maskImage:
                    'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 36px), transparent 100%)',
                WebkitMaskImage:
                    'linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 36px), transparent 100%)',
            };
        }
        if (canScrollDown) {
            return {
                maskImage:
                    'linear-gradient(to bottom, black calc(100% - 36px), transparent 100%)',
                WebkitMaskImage:
                    'linear-gradient(to bottom, black calc(100% - 36px), transparent 100%)',
            };
        }
        if (canScrollUp) {
            return {
                maskImage:
                    'linear-gradient(to bottom, transparent 0%, black 24px)',
                WebkitMaskImage:
                    'linear-gradient(to bottom, transparent 0%, black 24px)',
            };
        }
        return {};
    }, [canScrollUp, canScrollDown]);

    useEffect(() => {
        if (laravelOptions) {
            setData(
                'laravel',
                reconcile(laravelOptions, defaultAnswers(laravelOptions)),
            );
        }
    }, [laravelOptions, setData]);

    function submit(event: FormEvent) {
        event.preventDefault();
        form.post(scaffold().url);
    }

    function pickFolder() {
        // Posts keep this page's state, so take the chosen folder from the
        // response rather than relying on a remount.
        router.post(
            chooseFolder().url,
            { name: form.data.name, framework: form.data.framework },
            {
                onSuccess: (page) =>
                    form.setData('parent', String(page.props.parent)),
            },
        );
    }

    return (
        <AppLayout title="New project">
            <Link
                href={index().url}
                className="mb-3 inline-block text-xs text-soft hover:text-ink"
            >
                ← Projects
            </Link>
            <PageHeader
                title="New project"
                subtitle="Start an app from scratch, already set up for LaraKube. It runs in a container, so you don't need PHP or Node on this computer."
            />
            {/* The framework on the left, what depends on it in one card on the right; stacks when narrow. */}
            <form
                onSubmit={submit}
                className="grid max-w-6xl items-start gap-8 lg:grid-cols-[430px_minmax(0,1fr)] xl:grid-cols-[450px_minmax(0,1fr)]"
            >
                <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-ink">
                            Framework
                        </p>
                        <span className="text-xs text-soft">
                            {filteredFrameworks.length}{' '}
                            {filteredFrameworks.length === 1
                                ? 'framework'
                                : 'frameworks'}
                        </span>
                    </div>

                    {/* Category tabs */}
                    <div className="flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {CATEGORIES.map((cat) => {
                            const count =
                                cat.id === 'all'
                                    ? Object.keys(frameworks).length
                                    : Object.values(frameworks).filter(
                                          (f) => f.category === cat.id,
                                      ).length;
                            const active = selectedCategory === cat.id;

                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={cn(
                                        'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all',
                                        active
                                            ? 'bg-ink font-semibold text-paper shadow-2xs'
                                            : 'bg-surface font-medium text-soft ring-1 ring-line/80 hover:bg-badge hover:text-ink',
                                    )}
                                >
                                    <span>{cat.label}</span>
                                    <span
                                        className={cn(
                                            'py-0.2 rounded-full px-1.5 text-[10px] leading-tight font-medium',
                                            active
                                                ? 'bg-paper/20 text-paper'
                                                : 'bg-paper text-faint ring-1 ring-line/50',
                                        )}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Search filter */}
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter frameworks, languages, or tools…"
                            className="h-9 w-full rounded-xl border-0 bg-surface pr-8 pl-9 text-xs ring-1 ring-line transition outline-none placeholder:text-faint focus:ring-2 focus:ring-brand"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute top-1/2 right-2.5 -translate-y-1/2 p-0.5 text-faint transition hover:text-ink"
                                title="Clear search"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Frameworks scrollable list */}
                    <div
                        ref={listRef}
                        onScroll={checkScroll}
                        style={maskStyle}
                        className="custom-scrollbar h-[520px] max-h-[calc(100vh-260px)] min-h-[380px] space-y-2 overflow-y-auto p-1 pr-2 transition-[mask-image] duration-150"
                    >
                        {filteredFrameworks.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-line bg-surface/50 p-8 text-center">
                                <p className="text-xs font-medium text-ink">
                                    No frameworks match your filter
                                </p>
                                <p className="mt-1 text-xs text-soft">
                                    Try searching for a different keyword or
                                    reset your filter.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedCategory('all');
                                    }}
                                    className={cn(
                                        buttonClass('secondary', 'sm'),
                                        'mt-3',
                                    )}
                                >
                                    Reset filters
                                </button>
                            </div>
                        ) : (
                            filteredFrameworks.map(([slug, option]) => {
                                const isSelected = slug === form.data.framework;
                                const meta = FRAMEWORK_META[slug];

                                return (
                                    <button
                                        key={slug}
                                        type="button"
                                        disabled={
                                            option.comingSoon || isRunRunning
                                        }
                                        onClick={() =>
                                            !option.comingSoon &&
                                            !isRunRunning &&
                                            setData('framework', slug)
                                        }
                                        className={cn(
                                            'group relative flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all',
                                            option.comingSoon || isRunRunning
                                                ? 'cursor-not-allowed border-line/50 bg-surface/40 opacity-55'
                                                : isSelected
                                                  ? 'border-brand/60 bg-brand/[0.04] shadow-xs ring-1 ring-brand/40'
                                                  : 'hover:border-line-hover border-line bg-surface shadow-2xs hover:bg-paper/60',
                                        )}
                                    >
                                        <FrameworkLogo
                                            slug={slug}
                                            size="md"
                                            className="mt-0.5 shrink-0 transition-transform group-hover:scale-105"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                    <span
                                                        className={cn(
                                                            'truncate text-[13px]',
                                                            isSelected
                                                                ? 'font-semibold text-ink'
                                                                : 'font-medium text-ink transition-colors group-hover:text-brand',
                                                        )}
                                                    >
                                                        {option.label}
                                                    </span>
                                                    {meta && (
                                                        <span className="py-0.2 shrink-0 rounded-md bg-paper px-1.5 text-[10px] font-medium text-soft ring-1 ring-line/70">
                                                            {meta.tech}
                                                        </span>
                                                    )}
                                                    {option.comingSoon ? (
                                                        <span className="py-0.2 shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[9px] font-semibold text-amber-600 ring-1 ring-amber-500/25">
                                                            Soon
                                                        </span>
                                                    ) : option.category ===
                                                          'cms' &&
                                                      selectedCategory ===
                                                          'all' ? (
                                                        <span className="py-0.2 shrink-0 rounded-full bg-pink-500/10 px-1.5 text-[9px] font-medium text-pink-600 ring-1 ring-pink-500/20">
                                                            CMS
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {/* Active selection check indicator */}
                                                {!option.comingSoon && (
                                                    <div
                                                        className={cn(
                                                            'flex size-4.5 shrink-0 items-center justify-center rounded-full transition-all',
                                                            isSelected
                                                                ? 'bg-brand text-white shadow-2xs'
                                                                : 'group-hover:border-line-hover border border-line/80',
                                                        )}
                                                    >
                                                        {isSelected && (
                                                            <Check className="size-2.5 stroke-[3]" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-soft group-hover:text-soft/90">
                                                {option.description}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    {/* Framework list footer info & scroll hint */}
                    <div className="flex shrink-0 items-center justify-between px-1 text-[11px] text-faint">
                        <span>
                            {filteredFrameworks.length ===
                            Object.keys(frameworks).length
                                ? `${filteredFrameworks.length} frameworks`
                                : `${filteredFrameworks.length} of ${Object.keys(frameworks).length} frameworks`}
                        </span>
                        {canScrollDown && (
                            <button
                                type="button"
                                onClick={() => {
                                    listRef.current?.scrollBy({
                                        top: 220,
                                        behavior: 'smooth',
                                    });
                                }}
                                className="inline-flex cursor-pointer items-center gap-1 font-medium text-soft transition-colors hover:text-ink"
                            >
                                <span>More below</span>
                                <ChevronDown className="size-3 animate-bounce" />
                            </button>
                        )}
                    </div>
                    {form.errors.framework && (
                        <p className="mt-2 shrink-0 text-xs text-accent">
                            {form.errors.framework}
                        </p>
                    )}
                </div>

                <div className="min-w-0">
                    {activeRun ? (
                        <div className="flex h-[560px] max-h-[calc(100vh-220px)] min-h-[400px] flex-col overflow-hidden rounded-2xl bg-surface shadow-xs ring-1 ring-line ring-inset">
                            {/* Terminal Header */}
                            <div className="flex shrink-0 items-center justify-between border-b border-line bg-paper/50 px-6 py-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="relative flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-term text-white shadow-2xs">
                                        <Terminal className="size-4 text-brand" />
                                        {isRunRunning && (
                                            <span className="absolute -top-0.5 -right-0.5 size-2 animate-ping rounded-full bg-brand" />
                                        )}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-semibold text-ink">
                                                {activeRun.label}
                                            </span>
                                            <StatusPill tone={statusTone}>
                                                {statusLabel}
                                            </StatusPill>
                                        </div>
                                        <p className="text-xs text-soft">
                                            {isRunRunning
                                                ? 'Creating project container and setting up dependencies…'
                                                : activeRun.status ===
                                                    'succeeded'
                                                  ? elapsedText
                                                      ? `Finished in ${elapsedText}`
                                                      : 'Finished'
                                                  : elapsedText
                                                    ? `Failed after ${elapsedText}`
                                                    : 'Failed'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2.5">
                                    {isRunRunning && (
                                        <Link
                                            href={cancel(activeRun.id).url}
                                            method="post"
                                            as="button"
                                            className={buttonClass(
                                                'danger',
                                                'sm',
                                            )}
                                        >
                                            Cancel
                                        </Link>
                                    )}
                                    <Link
                                        href={showRun(activeRun.id).url}
                                        className="inline-flex items-center gap-1 text-xs text-soft hover:text-ink hover:underline"
                                        title="View in Activity"
                                    >
                                        <span>Activity</span>
                                        <ExternalLink className="size-3" />
                                    </Link>
                                </div>
                            </div>

                            {/* Live Streaming LogPanel */}
                            <div className="flex min-h-0 flex-1 flex-col bg-paper/20 p-4.5">
                                <LogPanel
                                    output={activeRun.output}
                                    placeholder={
                                        isRunRunning
                                            ? 'Starting container and scaffolding application…'
                                            : 'No output recorded.'
                                    }
                                    follow={isRunRunning}
                                    className="h-full min-h-0 flex-1"
                                />
                            </div>

                            {/* Action Footer */}
                            <div className="flex shrink-0 items-center justify-between border-t border-line bg-paper/60 px-6 py-4">
                                {activeRun.status === 'succeeded' ? (
                                    <>
                                        <div className="flex items-center gap-2 text-ok">
                                            <CheckCircle2 className="size-4.5 shrink-0" />
                                            <span className="text-xs font-medium text-ink">
                                                Your project is ready to build
                                                and deploy!
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <Link
                                                href={create().url}
                                                className={buttonClass(
                                                    'secondary',
                                                    'sm',
                                                )}
                                            >
                                                Create another
                                            </Link>
                                            {activeRun.meta?.project && (
                                                <Link
                                                    href={
                                                        show(
                                                            Number(
                                                                activeRun.meta
                                                                    .project,
                                                            ),
                                                        ).url
                                                    }
                                                    className={buttonClass(
                                                        'primary',
                                                        'sm',
                                                    )}
                                                >
                                                    <span>Open project</span>
                                                    <ArrowRight className="size-3.5" />
                                                </Link>
                                            )}
                                        </div>
                                    </>
                                ) : activeRun.status === 'failed' ? (
                                    <>
                                        <div className="flex items-center gap-2 text-accent">
                                            <AlertCircle className="size-4.5 shrink-0" />
                                            <span className="text-xs font-medium text-accent">
                                                Scaffolding failed. Inspect the
                                                log above.
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <Link
                                                href={create().url}
                                                className={buttonClass(
                                                    'primary',
                                                    'sm',
                                                )}
                                            >
                                                Try again
                                            </Link>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs text-soft">
                                            Initial container image download may
                                            take a couple minutes.
                                        </p>
                                        <span className="font-mono text-xs text-soft">
                                            Live log streaming
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl bg-surface shadow-xs ring-1 ring-line ring-inset">
                            {/* Header banner showing active framework */}
                            <div className="flex items-start gap-4 border-b border-line bg-paper/40 px-6 py-4.5">
                                <FrameworkLogo
                                    slug={form.data.framework}
                                    size="md"
                                    className="mt-0.5 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-base font-semibold text-ink">
                                            {selectedOption.label}
                                        </span>
                                        <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-soft ring-1 ring-line">
                                            {categoryBadgeLabel(
                                                selectedOption.category,
                                            )}
                                        </span>
                                        {FRAMEWORK_META[
                                            form.data.framework
                                        ] && (
                                            <span className="rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft ring-1 ring-line">
                                                {
                                                    FRAMEWORK_META[
                                                        form.data.framework
                                                    ].tech
                                                }
                                            </span>
                                        )}
                                        {selectedOption.comingSoon && (
                                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/25">
                                                Coming soon
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed text-soft">
                                        {selectedOption.description}
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-4 p-5.5">
                                <div
                                    className={cn(
                                        'grid gap-4',
                                        needsEmail && 'sm:grid-cols-2',
                                    )}
                                >
                                    <Field
                                        label="App name"
                                        error={form.errors.name}
                                        hint="Lowercase letters, numbers and dashes."
                                    >
                                        <input
                                            value={form.data.name}
                                            onChange={(event) =>
                                                setData(
                                                    'name',
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="my-first-app"
                                            autoFocus
                                            spellCheck={false}
                                            className={inputClass}
                                        />
                                    </Field>
                                    {needsEmail && (
                                        <Field
                                            label={
                                                isStatamic
                                                    ? 'Admin / SSL email'
                                                    : 'Your email'
                                            }
                                            error={form.errors.email}
                                            hint={
                                                isStatamic
                                                    ? 'For your Statamic super user & SSL certificate.'
                                                    : "For your site's SSL certificate."
                                            }
                                        >
                                            <input
                                                type="email"
                                                value={form.data.email}
                                                onChange={(event) =>
                                                    setData(
                                                        'email',
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="you@example.com"
                                                spellCheck={false}
                                                className={inputClass}
                                            />
                                        </Field>
                                    )}
                                </div>
                                <Field
                                    label="Create it in"
                                    error={form.errors.parent}
                                    labelled={false}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <p className="min-w-0 flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-xs ring-1 ring-line ring-inset">
                                            {form.data.parent}
                                            <span className="text-faint">
                                                /
                                                {form.data.name ||
                                                    'my-first-app'}
                                            </span>
                                        </p>
                                        <button
                                            type="button"
                                            onClick={pickFolder}
                                            className={buttonClass(
                                                'secondary',
                                                'sm',
                                            )}
                                        >
                                            Change…
                                        </button>
                                    </div>
                                </Field>
                            </div>

                            {isLaravel && (
                                <div className="space-y-4 border-t border-line p-5.5">
                                    <p className="text-[13px] font-medium">
                                        Laravel options
                                    </p>
                                    <Deferred
                                        data="laravelOptions"
                                        fallback={
                                            <div className="h-16 animate-pulse rounded-lg bg-paper" />
                                        }
                                    >
                                        {laravelOptions ? (
                                            <LaravelOptions
                                                questions={laravelOptions}
                                                answers={form.data.laravel}
                                                errors={
                                                    form.errors as Record<
                                                        string,
                                                        string
                                                    >
                                                }
                                                onChange={(answers) =>
                                                    setData('laravel', answers)
                                                }
                                            />
                                        ) : (
                                            <p className="text-sm text-warn">
                                                This LaraKube CLI is too old to
                                                create Laravel apps from here.
                                                Update it from Setup, then come
                                                back.
                                            </p>
                                        )}
                                    </Deferred>
                                </div>
                            )}

                            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-paper/60 px-5.5 py-3.5">
                                <p className="text-xs text-soft">
                                    The first one takes a few minutes while the
                                    container images download.
                                </p>
                                <div className="flex shrink-0 items-center gap-2.5">
                                    <Link
                                        href={index().url}
                                        className={buttonClass('ghost', 'sm')}
                                    >
                                        Cancel
                                    </Link>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={
                                            form.processing ||
                                            form.data.name.trim() === '' ||
                                            (isLaravel &&
                                                (!laravelOptions ||
                                                    form.data.email.trim() ===
                                                        ''))
                                        }
                                    >
                                        {form.processing
                                            ? 'Starting…'
                                            : 'Create project'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </form>
        </AppLayout>
    );
}

/** A labelled field. `labelled={false}` for rows holding a button, which a label would click. */
function Field({
    label,
    hint,
    error,
    labelled = true,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    labelled?: boolean;
    children: ReactNode;
}) {
    const Wrapper = labelled ? 'label' : 'div';

    return (
        <Wrapper className="block">
            <span className="mb-1.5 block text-xs font-medium text-soft">
                {label}
            </span>
            {children}
            {(error ?? hint) && (
                <span
                    className={cn(
                        'mt-1 block text-xs',
                        error ? 'text-accent' : 'text-soft',
                    )}
                >
                    {error ?? hint}
                </span>
            )}
        </Wrapper>
    );
}
