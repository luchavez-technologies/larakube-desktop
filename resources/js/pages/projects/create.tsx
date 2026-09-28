import { Deferred, Link, router, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
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
        router.post(chooseFolder().url, {
            name: form.data.name,
            framework: form.data.framework,
        });
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
            <form onSubmit={submit} className="max-w-3xl">
                <p className="mb-2.5 text-[13px] font-medium">Framework</p>
                <div className="grid grid-cols-2 gap-3">
                    {Object.entries(frameworks).map(([slug, option]) => (
                        <button
                            key={slug}
                            type="button"
                            onClick={() => form.setData('framework', slug)}
                            className={cn(
                                'rounded-xl bg-surface px-4 py-3.5 text-left transition',
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

                <div className="mt-5 space-y-4 rounded-2xl bg-surface p-5.5 ring-1 ring-line ring-inset">
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-soft">
                            App name
                        </span>
                        <input
                            value={form.data.name}
                            onChange={(event) =>
                                form.setData('name', event.target.value)
                            }
                            placeholder="my-first-app"
                            autoFocus
                            spellCheck={false}
                            className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand"
                        />
                        <span
                            className={cn(
                                'mt-1 block text-xs',
                                form.errors.name ? 'text-accent' : 'text-soft',
                            )}
                        >
                            {form.errors.name ??
                                'Lowercase letters, numbers and dashes. Also the folder name.'}
                        </span>
                    </label>
                    <div>
                        <span className="mb-1.5 block text-xs font-medium text-soft">
                            Create it in
                        </span>
                        <div className="flex items-center gap-2.5">
                            <p className="min-w-0 flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-xs ring-1 ring-line ring-inset">
                                {form.data.parent}
                                {form.data.name && (
                                    <span className="text-faint">
                                        /{form.data.name}
                                    </span>
                                )}
                            </p>
                            <button
                                type="button"
                                onClick={pickFolder}
                                className={buttonClass('secondary', 'sm')}
                            >
                                Change…
                            </button>
                        </div>
                        {form.errors.parent && (
                            <span className="mt-1 block text-xs text-accent">
                                {form.errors.parent}
                            </span>
                        )}
                    </div>
                </div>

                {isLaravel && (
                    <div className="mt-5 space-y-4 rounded-2xl bg-surface p-5.5 ring-1 ring-line ring-inset">
                        <p className="text-[13px] font-medium">
                            Laravel options
                        </p>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-medium text-soft">
                                Your email
                            </span>
                            <input
                                type="email"
                                value={form.data.email}
                                onChange={(event) =>
                                    form.setData('email', event.target.value)
                                }
                                placeholder="you@example.com"
                                spellCheck={false}
                                className="w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand"
                            />
                            <span
                                className={cn(
                                    'mt-1 block text-xs',
                                    form.errors.email
                                        ? 'text-accent'
                                        : 'text-soft',
                                )}
                            >
                                {form.errors.email ??
                                    "Let's Encrypt uses it for your site's SSL certificate. It needs a real mail domain."}
                            </span>
                        </label>
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
                                        form.errors as Record<string, string>
                                    }
                                    onChange={(answers) =>
                                        form.setData('laravel', answers)
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

                <div className="mt-5 flex items-center justify-between gap-4">
                    <p className="text-[13px] text-soft">
                        The first one takes a few minutes while the container
                        images download.
                    </p>
                    <div className="flex items-center gap-2.5">
                        <Link
                            href={index().url}
                            className={buttonClass('ghost')}
                        >
                            Cancel
                        </Link>
                        <Button
                            type="submit"
                            disabled={
                                form.processing ||
                                form.data.name.trim() === '' ||
                                (isLaravel &&
                                    (!laravelOptions ||
                                        form.data.email.trim() === ''))
                            }
                        >
                            {form.processing ? 'Starting…' : 'Create project'}
                        </Button>
                    </div>
                </div>
            </form>
        </AppLayout>
    );
}
