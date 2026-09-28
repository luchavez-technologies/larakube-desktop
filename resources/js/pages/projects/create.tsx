import { Deferred, Link, router, useForm } from '@inertiajs/react';
import type { FormEvent, ReactNode } from 'react';
import { useEffect } from 'react';
import Button, { buttonClass } from '@/components/button';
import LaravelOptions, {
    defaultAnswers,
    reconcile,
} from '@/components/laravel-options';
import PageHeader from '@/components/page-header';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import { chooseFolder, index, scaffold } from '@/routes/projects';
import type { NewAppAnswers, NewAppQuestion } from '@/types/larakube';

type Framework = { label: string; description: string };

const inputClass =
    'w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand';

export default function CreateProject({
    frameworks,
    parent,
    name,
    framework,
    email,
    laravelOptions,
}: {
    frameworks: Record<string, Framework>;
    parent: string;
    name: string;
    framework: string;
    email: string;
    laravelOptions?: NewAppQuestion[] | null;
}) {
    const form = useForm<{
        name: string;
        framework: string;
        parent: string;
        email: string;
        laravel: NewAppAnswers;
    }>({ name, framework, parent, email, laravel: {} });
    const isLaravel = form.data.framework === 'laravel';
    const { setData } = form;

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
                className="grid max-w-5xl items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"
            >
                <div>
                    <p className="mb-2.5 text-[13px] font-medium">Framework</p>
                    <div className="grid gap-2">
                        {Object.entries(frameworks).map(([slug, option]) => (
                            <button
                                key={slug}
                                type="button"
                                onClick={() => setData('framework', slug)}
                                className={cn(
                                    'rounded-xl bg-surface px-4 py-3 text-left transition',
                                    slug === form.data.framework
                                        ? 'ring-2 ring-brand'
                                        : 'ring-1 ring-line hover:ring-faint',
                                )}
                            >
                                <span className="block text-sm font-medium">
                                    {option.label}
                                </span>
                                <span className="mt-0.5 block text-xs text-soft">
                                    {option.description}
                                </span>
                            </button>
                        ))}
                    </div>
                    {form.errors.framework && (
                        <p className="mt-2 text-xs text-accent">
                            {form.errors.framework}
                        </p>
                    )}
                </div>

                <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line ring-inset lg:mt-[30px]">
                    <div className="space-y-4 p-5.5">
                        <div
                            className={cn(
                                'grid gap-4',
                                isLaravel && 'sm:grid-cols-2',
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
                                        setData('name', event.target.value)
                                    }
                                    placeholder="my-first-app"
                                    autoFocus
                                    spellCheck={false}
                                    className={inputClass}
                                />
                            </Field>
                            {isLaravel && (
                                <Field
                                    label="Your email"
                                    error={form.errors.email}
                                    hint="For your site's SSL certificate."
                                >
                                    <input
                                        type="email"
                                        value={form.data.email}
                                        onChange={(event) =>
                                            setData('email', event.target.value)
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
                                        /{form.data.name || 'my-first-app'}
                                    </span>
                                </p>
                                <button
                                    type="button"
                                    onClick={pickFolder}
                                    className={buttonClass('secondary', 'sm')}
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
                                        This LaraKube CLI is too old to create
                                        Laravel apps from here. Update it from
                                        Setup, then come back.
                                    </p>
                                )}
                            </Deferred>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-4 border-t border-line bg-paper/60 px-5.5 py-3.5">
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
                                            form.data.email.trim() === ''))
                                }
                            >
                                {form.processing
                                    ? 'Starting…'
                                    : 'Create project'}
                            </Button>
                        </div>
                    </div>
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
