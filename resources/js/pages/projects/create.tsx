import { Link, router, useForm, usePoll } from '@inertiajs/react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronDown,
    ExternalLink,
    Laptop,
    Search,
    Server,
    Terminal,
    X,
} from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import CommonsNotice from '@/components/commons-notice';
import FrameworkLogo from '@/components/framework-logo';
import FrameworkFields, {
    defaultAnswers,
    reconcile,
} from '@/components/framework-fields';
import LogPanel from '@/components/log-panel';
import PageHeader from '@/components/page-header';
import StatusPill, { type Tone } from '@/components/status-pill';
import AppLayout from '@/layouts/app-layout';
import { runStatus } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { index as devBoxesIndex } from '@/routes/devboxes';
import {
    chooseFolder,
    create,
    index,
    scaffold,
    scaffoldDevBox,
    show,
} from '@/routes/projects';
import { cancel, show as showRun } from '@/routes/runs';
import type {
    CommonsState,
    FrameworkCatalog,
    FrameworkInfo,
    NewAppAnswers,
} from '@/types/larakube';

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
    catalog,
    commons,
    devBoxes = [],
    initialBox = '',
    parent,
    name,
    framework,
    email,
    activeRun,
}: {
    catalog?: FrameworkCatalog | null;
    commons?: CommonsState;
    devBoxes?: { name: string; ip: string | null }[];
    initialBox?: string;
    parent: string;
    name: string;
    framework: string;
    email: string;
    activeRun?: ActiveRun | null;
}) {
    const form = useForm<{
        framework: string;
        parent: string;
        box: string;
        answers: NewAppAnswers;
    }>({ framework, parent, box: initialBox, answers: {} });
    // Empty means this computer; otherwise the name of a dev box the app is created on.
    const onBox = form.data.box !== '';
    const frameworks = useMemo(() => catalog?.frameworks ?? [], [catalog]);
    const categories = useMemo(
        () => [{ id: 'all', label: 'All' }, ...(catalog?.categories ?? [])],
        [catalog],
    );
    const categoryLabel = (id: string) =>
        categories.find((category) => category.id === id)?.label ?? id;
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

    const { setData } = form;

    const filteredFrameworks = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return frameworks.filter((option) => {
            if (
                selectedCategory !== 'all' &&
                option.category !== selectedCategory
            ) {
                return false;
            }

            return (
                query === '' ||
                [
                    option.slug,
                    option.label,
                    option.description,
                    option.category,
                    option.tech,
                ].some((text) => text.toLowerCase().includes(query))
            );
        });
    }, [frameworks, selectedCategory, searchQuery]);

    const selectedOption: FrameworkInfo | undefined = frameworks.find(
        (option) => option.slug === form.data.framework,
    );
    const nameField = selectedOption?.fields.find(
        (field) => field.arg === 'positional',
    );
    const chosenName = nameField
        ? String(form.data.answers[nameField.key] ?? '')
        : '';

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

    // Start each framework from the answers the CLI suggests, keeping the name and
    // email already typed, and the email last used.
    useEffect(() => {
        if (!selectedOption) return;

        const defaults = reconcile(
            selectedOption.fields,
            defaultAnswers(selectedOption.fields),
        );

        setData((data) => {
            const previous = data.answers;
            const kept: NewAppAnswers = {};

            for (const field of selectedOption.fields) {
                const typed = previous[field.key];

                if (field.type === 'text' && typeof typed === 'string') {
                    kept[field.key] = typed;
                } else if (field.arg === 'positional' && name !== '') {
                    kept[field.key] = name;
                } else if (field.format === 'email' && email !== '') {
                    kept[field.key] = email;
                }
            }

            return { ...data, answers: { ...defaults, ...kept } };
        });
    }, [selectedOption, setData, name, email]);

    function submit(event: FormEvent) {
        event.preventDefault();
        form.post((onBox ? scaffoldDevBox() : scaffold()).url);
    }

    function pickFolder() {
        // Posts keep this page's state, so take the chosen folder from the
        // response rather than relying on a remount.
        router.post(
            chooseFolder().url,
            { name: chosenName, framework: form.data.framework },
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
                        {categories.map((cat) => {
                            const count =
                                cat.id === 'all'
                                    ? frameworks.length
                                    : frameworks.filter(
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
                            filteredFrameworks.map((option) => {
                                const slug = option.slug;
                                const isSelected = slug === form.data.framework;

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
                                                    <span className="py-0.2 shrink-0 rounded-md bg-paper px-1.5 text-[10px] font-medium text-soft ring-1 ring-line/70">
                                                        {option.tech}
                                                    </span>
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
                            {filteredFrameworks.length === frameworks.length
                                ? `${filteredFrameworks.length} frameworks`
                                : `${filteredFrameworks.length} of ${frameworks.length} frameworks`}
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
                                            {activeRun.meta?.role === 'dev' && (
                                                <Link
                                                    href={devBoxesIndex().url}
                                                    className={buttonClass(
                                                        'primary',
                                                        'sm',
                                                    )}
                                                >
                                                    <span>
                                                        Open the dev box
                                                    </span>
                                                    <ArrowRight className="size-3.5" />
                                                </Link>
                                            )}
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
                            {!selectedOption ? (
                                catalog === null ? (
                                    <p className="p-5.5 text-sm text-warn">
                                        This LaraKube CLI is too old to list
                                        frameworks. Update it from Setup, then
                                        come back.
                                    </p>
                                ) : (
                                    <div className="m-5.5 h-40 animate-pulse rounded-lg bg-paper" />
                                )
                            ) : (
                                <>
                                    {/* Header banner showing active framework */}
                                    <div className="flex items-start gap-4 border-b border-line bg-paper/40 px-6 py-4.5">
                                        <FrameworkLogo
                                            slug={selectedOption.slug}
                                            size="md"
                                            className="mt-0.5 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-base font-semibold text-ink">
                                                    {selectedOption.label}
                                                </span>
                                                <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-soft ring-1 ring-line">
                                                    {categoryLabel(
                                                        selectedOption.category,
                                                    )}
                                                </span>
                                                <span className="rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-soft ring-1 ring-line">
                                                    {selectedOption.tech}
                                                </span>
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
                                    {devBoxes.length > 0 && (
                                        <div className="space-y-2 px-5.5 pt-5.5">
                                            <p className="text-[13px] font-semibold text-ink">
                                                Where do you want to make it?
                                            </p>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                {[
                                                    {
                                                        name: '',
                                                        label: 'This computer',
                                                        detail: 'Runs on your machine',
                                                        Icon: Laptop,
                                                    },
                                                    ...devBoxes.map((box) => ({
                                                        name: box.name,
                                                        label: box.name,
                                                        detail: 'Dev box',
                                                        Icon: Server,
                                                    })),
                                                ].map(
                                                    ({
                                                        name,
                                                        label,
                                                        detail,
                                                        Icon,
                                                    }) => (
                                                        <button
                                                            key={name}
                                                            type="button"
                                                            onClick={() =>
                                                                setData(
                                                                    'box',
                                                                    name,
                                                                )
                                                            }
                                                            className={cn(
                                                                'flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition',
                                                                form.data
                                                                    .box ===
                                                                    name
                                                                    ? 'bg-ink text-surface shadow-xs'
                                                                    : 'bg-surface text-ink ring-1 ring-line hover:bg-paper',
                                                            )}
                                                        >
                                                            <Icon className="size-5 shrink-0" />
                                                            <span className="min-w-0">
                                                                <span className="block truncate text-sm font-medium">
                                                                    {label}
                                                                </span>
                                                                <span
                                                                    className={cn(
                                                                        'block text-xs',
                                                                        form
                                                                            .data
                                                                            .box ===
                                                                            name
                                                                            ? 'text-surface/80'
                                                                            : 'text-soft',
                                                                    )}
                                                                >
                                                                    {detail}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    ),
                                                )}
                                            </div>
                                            {form.errors.box && (
                                                <p className="text-xs text-accent">
                                                    {form.errors.box}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    <div className="space-y-4 p-5.5">
                                        <FrameworkFields
                                            fields={selectedOption.fields}
                                            answers={form.data.answers}
                                            errors={
                                                form.errors as Record<
                                                    string,
                                                    string
                                                >
                                            }
                                            errorPrefix="answers"
                                            onChange={(answers) =>
                                                setData('answers', answers)
                                            }
                                            autoFocus
                                            afterEssential={
                                                <>
                                                    {onBox && (
                                                        <p className="rounded-lg bg-paper px-3 py-2 text-xs leading-relaxed text-soft ring-1 ring-line ring-inset">
                                                            Created on{' '}
                                                            <span className="font-mono text-ink">
                                                                {form.data.box}
                                                            </span>{' '}
                                                            in{' '}
                                                            <span className="font-mono text-ink">
                                                                ~/projects/
                                                                {chosenName ||
                                                                    'my-first-app'}
                                                            </span>
                                                            . Its database and
                                                            cache run on that
                                                            box.
                                                        </p>
                                                    )}
                                                    {!onBox && (
                                                        <CommonsNotice
                                                            fields={
                                                                selectedOption.fields
                                                            }
                                                            answers={
                                                                form.data
                                                                    .answers
                                                            }
                                                            commons={commons}
                                                        />
                                                    )}
                                                    {!onBox && (
                                                        <Field
                                                            label="Create it in"
                                                            error={
                                                                form.errors
                                                                    .parent
                                                            }
                                                            labelled={false}
                                                        >
                                                            <div className="flex items-center gap-2.5">
                                                                <p className="min-w-0 flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-xs ring-1 ring-line ring-inset">
                                                                    {
                                                                        form
                                                                            .data
                                                                            .parent
                                                                    }
                                                                    <span className="text-faint">
                                                                        /
                                                                        {chosenName ||
                                                                            'my-first-app'}
                                                                    </span>
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={
                                                                        pickFolder
                                                                    }
                                                                    className={buttonClass(
                                                                        'secondary',
                                                                        'sm',
                                                                    )}
                                                                >
                                                                    Change…
                                                                </button>
                                                            </div>
                                                        </Field>
                                                    )}
                                                </>
                                            }
                                        />
                                    </div>
                                </>
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
                                            !selectedOption ||
                                            chosenName.trim() === ''
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
