import { useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Laptop, Rocket, Server as ServerIcon, X } from 'lucide-react';
import Button from '@/components/button';
import FrameworkFields, {
    defaultAnswers,
    reconcile,
} from '@/components/framework-fields';
import FrameworkLogo from '@/components/framework-logo';
import ExperimentalBadge from '@/components/experimental-badge';
import { useRightDrawerOpen } from '@/lib/right-drawer-open';
import { cn } from '@/lib/utils';
import { scaffold, scaffoldDevBox } from '@/routes/projects';
import type {
    FrameworkCatalog,
    FrameworkInfo,
    NewAppAnswers,
    Untested,
} from '@/types/larakube';

export type QuickLaunchProjectId = 'laravel' | 'nextjs' | 'django';

/**
 * The three frameworks this fast-launch picker offers — a deliberately short
 * list (the full New Project page already offers everything the CLI
 * supports). Visual/behavioral data for each still comes live from
 * `catalog`, never hand-curated here (ADR 0010's reasoning applies the same
 * way to projects as it does to tool options).
 */
export const QUICK_LAUNCH_PROJECT_IDS: QuickLaunchProjectId[] = [
    'laravel',
    'nextjs',
    'django',
];

/**
 * A fast-launch sibling to `projects/create.tsx` for the three most common
 * frameworks — same underlying `scaffold()`/`scaffoldDevBox()` pipeline and
 * `FrameworkFields` form, just the quick-launch-shaped front door instead of
 * the full picker/folder-chooser/live-log page. Submitting navigates to that
 * same full page, which already shows live progress — this modal doesn't
 * reimplement that.
 */
export default function QuickLaunchProjectsModal({
    isOpen,
    onClose,
    initialFramework = 'laravel',
    catalog,
    devBoxes = [],
    defaultParent,
}: {
    isOpen: boolean;
    onClose: () => void;
    initialFramework?: QuickLaunchProjectId;
    catalog?: FrameworkCatalog | null;
    devBoxes?: { name: string; ip: string | null }[];
    defaultParent: string;
}) {
    useRightDrawerOpen(isOpen);

    const { untested } = usePage<{ untested: Untested }>().props;

    const [slidIn, setSlidIn] = useState(false);
    useEffect(() => {
        if (!isOpen) {
            setSlidIn(false);
            return;
        }
        const frame = requestAnimationFrame(() => setSlidIn(true));
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    const form = useForm<{
        framework: string;
        parent: string;
        box: string;
        answers: NewAppAnswers;
    }>({
        framework: initialFramework,
        parent: defaultParent,
        box: '',
        answers: {},
    });
    const { setData } = form;

    useEffect(() => {
        if (isOpen) {
            setData((data) => ({
                ...data,
                framework: initialFramework,
                parent: defaultParent,
            }));
        }
        // Only when the modal opens with a (possibly new) preselected app —
        // not on every defaultParent/initialFramework re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const frameworks = (catalog?.frameworks ?? []).filter((option) =>
        QUICK_LAUNCH_PROJECT_IDS.includes(option.slug as QuickLaunchProjectId),
    );
    const selected: FrameworkInfo | undefined = frameworks.find(
        (option) => option.slug === form.data.framework,
    );
    const onBox = form.data.box !== '';

    useEffect(() => {
        if (!selected) return;

        const defaults = reconcile(
            selected.fields,
            defaultAnswers(selected.fields),
        );
        setData((data) => ({ ...data, answers: defaults }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.slug]);

    const nameField = selected?.fields.find(
        (field) => field.arg === 'positional',
    );
    const chosenName = nameField
        ? String(form.data.answers[nameField.key] ?? '')
        : '';

    if (!isOpen) {
        return null;
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        form.post((onBox ? scaffoldDevBox() : scaffold()).url);
    }

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end bg-ink/45 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={cn(
                    'flex h-full w-full max-w-xl flex-col overflow-hidden bg-surface shadow-2xl ring-1 ring-line transition-transform duration-300 ease-out',
                    slidIn ? 'translate-x-0' : 'translate-x-full',
                )}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
                            <Rocket className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-ink">
                                Quick Launch Projects
                            </h2>
                            <p className="text-xs text-soft">
                                Scaffold a new app in seconds
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-soft transition hover:bg-paper hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <form
                    onSubmit={submit}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                        {catalog === null ? (
                            <p className="text-sm text-warn">
                                This LaraKube CLI is too old to list frameworks.
                                Update it from Setup, then come back.
                            </p>
                        ) : (
                            <>
                                <div>
                                    <p className="mb-1.5 text-xs font-medium text-soft">
                                        Framework
                                    </p>
                                    <div className="grid grid-cols-3 gap-2.5">
                                        {frameworks.map((option) => (
                                            <button
                                                key={option.slug}
                                                type="button"
                                                onClick={() =>
                                                    setData(
                                                        'framework',
                                                        option.slug,
                                                    )
                                                }
                                                className={cn(
                                                    'flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition',
                                                    option.slug ===
                                                        form.data.framework
                                                        ? 'border-brand/60 bg-brand/[0.04] ring-1 ring-brand/40'
                                                        : 'border-line bg-surface hover:bg-paper/60',
                                                )}
                                            >
                                                <FrameworkLogo
                                                    slug={option.slug}
                                                    size="md"
                                                />
                                                <span className="text-xs font-semibold text-ink">
                                                    {option.label}
                                                </span>
                                                {untested.frameworks.includes(
                                                    option.slug,
                                                ) && <ExperimentalBadge />}
                                            </button>
                                        ))}
                                    </div>
                                    {form.errors.framework && (
                                        <p className="mt-1.5 text-xs text-accent">
                                            {form.errors.framework}
                                        </p>
                                    )}
                                </div>

                                {selected && (
                                    <>
                                        <p className="text-xs leading-relaxed text-soft">
                                            {selected.description}
                                        </p>

                                        {devBoxes.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <p className="text-xs font-medium text-soft">
                                                        Where do you want to
                                                        make it?
                                                    </p>
                                                    {untested.capabilities.includes(
                                                        'dev-boxes',
                                                    ) && <ExperimentalBadge />}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2.5">
                                                    {[
                                                        {
                                                            name: '',
                                                            label: 'This computer',
                                                            Icon: Laptop,
                                                        },
                                                        ...devBoxes.map(
                                                            (box) => ({
                                                                name: box.name,
                                                                label: box.name,
                                                                Icon: ServerIcon,
                                                            }),
                                                        ),
                                                    ].map(
                                                        ({
                                                            name,
                                                            label,
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
                                                                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition',
                                                                    form.data
                                                                        .box ===
                                                                        name
                                                                        ? 'bg-ink text-surface'
                                                                        : 'bg-surface text-ink ring-1 ring-line hover:bg-paper',
                                                                )}
                                                            >
                                                                <Icon className="size-4 shrink-0" />
                                                                <span className="truncate text-xs font-medium">
                                                                    {label}
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

                                        <FrameworkFields
                                            fields={selected.fields}
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
                                        />

                                        <p className="rounded-lg bg-paper px-3 py-2 text-xs leading-relaxed text-soft ring-1 ring-line ring-inset">
                                            {onBox ? (
                                                <>
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
                                                    . Its database and cache run
                                                    on that box.
                                                </>
                                            ) : (
                                                <>
                                                    Created in{' '}
                                                    <span className="font-mono text-ink">
                                                        {defaultParent}/
                                                        {chosenName ||
                                                            'my-first-app'}
                                                    </span>
                                                    . Need a different folder?
                                                    Use the full New Project
                                                    page instead.
                                                </>
                                            )}
                                        </p>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-paper/60 px-5 py-3.5 sm:px-6">
                        <p className="text-xs text-soft">
                            The first one takes a few minutes while container
                            images download.
                        </p>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={
                                form.processing ||
                                !selected ||
                                chosenName.trim() === ''
                            }
                        >
                            {form.processing ? 'Starting…' : 'Create project'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
