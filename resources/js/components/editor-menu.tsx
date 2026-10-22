import { useEffect, useRef } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, Code2, Sparkles } from 'lucide-react';
import { buttonClass } from '@/components/button';
import EditorLogo from '@/components/editor-logo';
import { cn } from '@/lib/utils';
import { editor as openEditor } from '@/routes/projects';
import type { Editor, Project } from '@/types/larakube';

export default function EditorMenu({
    project,
    editors,
    defaultEditor,
    compact = false,
    showFullLabel = false,
    align = 'right',
    className,
}: {
    project: Pick<Project, 'id'> & Partial<Project>;
    editors?: Editor[];
    defaultEditor?: string;
    compact?: boolean;
    showFullLabel?: boolean;
    align?: 'left' | 'right';
    className?: string;
}) {
    const pageProps = usePage().props as { errors?: Record<string, string> };
    const errors = pageProps.errors ?? {};
    const detailsRef = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                detailsRef.current &&
                !detailsRef.current.contains(e.target as Node)
            ) {
                detailsRef.current.removeAttribute('open');
            }
        }
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    if (!editors || editors.length === 0) {
        return null;
    }

    const agents = editors.filter((e) => e.category === 'agent');
    const codeEditors = editors.filter((e) => e.category !== 'agent');

    const preferred =
        (defaultEditor && editors.find((e) => e.slug === defaultEditor)) ||
        editors[0];

    if (compact) {
        if (editors.length === 1) {
            return (
                <Link
                    href={openEditor(project.id).url}
                    method="post"
                    data={{ editor: editors[0].slug }}
                    as="button"
                    preserveScroll
                    className={cn(
                        'inline-flex h-7 items-center justify-center rounded-md text-ink ring-1 ring-line transition ring-inset hover:bg-paper',
                        showFullLabel
                            ? 'gap-2 px-2.5 text-xs font-medium'
                            : 'px-1.5 text-soft hover:text-ink',
                        className,
                    )}
                    title={`Open in ${editors[0].label}`}
                >
                    <EditorLogo slug={editors[0].slug} size="xs" />
                    {showFullLabel && (
                        <span className="max-w-[130px] truncate">
                            {editors[0].label}
                        </span>
                    )}
                </Link>
            );
        }

        return (
            <div
                className={cn(
                    'relative inline-flex items-stretch rounded-md bg-surface shadow-2xs ring-1 ring-line ring-inset',
                    className,
                )}
            >
                {/* Direct Action: Launches preferred editor/agent */}
                <Link
                    href={openEditor(project.id).url}
                    method="post"
                    data={{ editor: preferred.slug }}
                    as="button"
                    preserveScroll
                    className={cn(
                        'inline-flex h-7 items-center rounded-l-md text-ink transition hover:bg-paper focus:outline-none',
                        showFullLabel
                            ? 'gap-2 px-2.5 text-xs font-medium'
                            : 'px-1.5 text-soft hover:text-ink',
                    )}
                    title={`Open in ${preferred.label}`}
                >
                    <EditorLogo slug={preferred.slug} size="xs" />
                    {showFullLabel && (
                        <span className="max-w-[130px] truncate">
                            {preferred.label}
                        </span>
                    )}
                </Link>

                {/* Dropdown Toggle: Separated by vertical border-l */}
                <details
                    ref={detailsRef}
                    className="group relative flex items-stretch"
                >
                    <summary
                        className="flex h-7 w-6 cursor-pointer list-none items-center justify-center rounded-r-md border-l border-line text-soft transition hover:bg-paper hover:text-ink focus:outline-none"
                        title="Choose code editor or AI agent"
                        aria-label="Choose code editor or AI agent"
                    >
                        <ChevronDown className="size-2.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <div
                        className={cn(
                            'absolute top-full z-40 mt-1.5 w-52 rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line',
                            align === 'left' ? 'left-0' : 'right-0',
                        )}
                    >
                        {agents.length > 0 && (
                            <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                                AI Coding Agents
                            </div>
                        )}
                        {agents.map((agent) => (
                            <Link
                                key={agent.slug}
                                href={openEditor(project.id).url}
                                method="post"
                                data={{ editor: agent.slug }}
                                as="button"
                                preserveScroll
                                onClick={() =>
                                    detailsRef.current?.removeAttribute('open')
                                }
                                className={cn(
                                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-paper',
                                    agent.slug === preferred.slug &&
                                        'bg-brand/5 text-brand',
                                )}
                            >
                                <EditorLogo slug={agent.slug} size="xs" />
                                <span className="truncate">{agent.label}</span>
                                {agent.slug === defaultEditor && (
                                    <span className="ml-auto text-[10px] font-normal text-soft">
                                        Default
                                    </span>
                                )}
                            </Link>
                        ))}
                        {agents.length > 0 && codeEditors.length > 0 && (
                            <div className="my-1 border-t border-line/60" />
                        )}
                        {codeEditors.length > 0 && (
                            <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                                Code Editors
                            </div>
                        )}
                        {codeEditors.map((editor) => (
                            <Link
                                key={editor.slug}
                                href={openEditor(project.id).url}
                                method="post"
                                data={{ editor: editor.slug }}
                                as="button"
                                preserveScroll
                                onClick={() =>
                                    detailsRef.current?.removeAttribute('open')
                                }
                                className={cn(
                                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink transition-colors hover:bg-paper',
                                    editor.slug === preferred.slug &&
                                        'bg-brand/5 text-brand',
                                )}
                            >
                                <EditorLogo slug={editor.slug} size="xs" />
                                <span className="truncate">{editor.label}</span>
                                {editor.slug === defaultEditor && (
                                    <span className="ml-auto text-[10px] font-normal text-soft">
                                        Default
                                    </span>
                                )}
                            </Link>
                        ))}
                    </div>
                </details>
            </div>
        );
    }

    const triggerLabel =
        codeEditors.length === 0
            ? 'Open in AI agent'
            : agents.length === 0
              ? 'Open in editor'
              : 'Open in editor / agent';

    const TriggerIcon = codeEditors.length === 0 ? Sparkles : Code2;

    return (
        <div className={cn('relative', className)}>
            {editors.length === 1 ? (
                <Link
                    href={openEditor(project.id).url}
                    method="post"
                    data={{ editor: editors[0].slug }}
                    as="button"
                    preserveScroll
                    className={cn(buttonClass('secondary'), 'gap-2')}
                >
                    <EditorLogo slug={editors[0].slug} size="xs" />
                    <span>Open in {editors[0].label}</span>
                </Link>
            ) : (
                <details ref={detailsRef} className="group">
                    <summary
                        className={cn(
                            buttonClass('secondary'),
                            'cursor-pointer list-none gap-2',
                        )}
                    >
                        <TriggerIcon className="size-4 text-soft" />
                        <span>{triggerLabel}</span>
                        <ChevronDown className="size-3 text-soft transition-transform group-open:rotate-180" />
                    </summary>
                    <div
                        className={cn(
                            'absolute z-10 mt-1.5 w-52 rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line',
                            align === 'left' ? 'left-0' : 'right-0',
                        )}
                    >
                        {agents.length > 0 && (
                            <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                                AI Coding Agents
                            </div>
                        )}
                        {agents.map((agent) => (
                            <Link
                                key={agent.slug}
                                href={openEditor(project.id).url}
                                method="post"
                                data={{ editor: agent.slug }}
                                as="button"
                                preserveScroll
                                onClick={() =>
                                    detailsRef.current?.removeAttribute('open')
                                }
                                className={cn(
                                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-paper',
                                    agent.slug === defaultEditor &&
                                        'bg-brand/5 text-brand',
                                )}
                            >
                                <EditorLogo slug={agent.slug} size="xs" />
                                <span className="truncate">{agent.label}</span>
                                {agent.slug === defaultEditor && (
                                    <span className="ml-auto text-[10px] font-normal text-soft">
                                        Default
                                    </span>
                                )}
                            </Link>
                        ))}
                        {agents.length > 0 && codeEditors.length > 0 && (
                            <div className="my-1 border-t border-line/60" />
                        )}
                        {codeEditors.length > 0 && agents.length > 0 && (
                            <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                                Code Editors
                            </div>
                        )}
                        {codeEditors.map((editor) => (
                            <Link
                                key={editor.slug}
                                href={openEditor(project.id).url}
                                method="post"
                                data={{ editor: editor.slug }}
                                as="button"
                                preserveScroll
                                onClick={() =>
                                    detailsRef.current?.removeAttribute('open')
                                }
                                className={cn(
                                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-paper',
                                    editor.slug === defaultEditor &&
                                        'bg-brand/5 text-brand',
                                )}
                            >
                                <EditorLogo slug={editor.slug} size="xs" />
                                <span className="truncate">{editor.label}</span>
                                {editor.slug === defaultEditor && (
                                    <span className="ml-auto text-[10px] font-normal text-soft">
                                        Default
                                    </span>
                                )}
                            </Link>
                        ))}
                    </div>
                </details>
            )}
            {errors.editor && (
                <p className="absolute right-0 mt-1.5 w-56 text-right text-xs text-accent">
                    {errors.editor}
                </p>
            )}
        </div>
    );
}
