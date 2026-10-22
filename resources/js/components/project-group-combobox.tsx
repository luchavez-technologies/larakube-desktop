import { useState, useRef, useEffect } from 'react';
import {
    Check,
    ChevronsUpDown,
    FolderMinus,
    FolderTree,
    Plus,
    Search,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/larakube';

export default function ProjectGroupCombobox({
    project,
    existingGroups = [],
    onAssign,
    variant = 'table',
    align = 'left',
    className,
}: {
    project: Project;
    existingGroups?: string[];
    onAssign: (projectId: number, group: string | null) => void;
    variant?: 'table' | 'icon';
    align?: 'left' | 'right';
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Click outside listener
    useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleSelect = (groupName: string | null) => {
        onAssign(project.id, groupName);
        setIsOpen(false);
    };

    const trimmedQuery = query.trim();
    const filteredGroups = existingGroups.filter((g) =>
        g.toLowerCase().includes(trimmedQuery.toLowerCase()),
    );

    const hasExactMatch = existingGroups.some(
        (g) => g.toLowerCase() === trimmedQuery.toLowerCase(),
    );

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (trimmedQuery) {
                if (filteredGroups.length === 1 && hasExactMatch) {
                    handleSelect(filteredGroups[0]);
                } else {
                    handleSelect(trimmedQuery);
                }
            }
        }
    };

    return (
        <div
            ref={containerRef}
            data-open={isOpen ? 'true' : undefined}
            className={cn('relative inline-flex', isOpen && 'z-50', className)}
        >
            {/* Trigger Button */}
            {variant === 'icon' ? (
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        'rounded-lg p-1.5 transition hover:bg-paper focus:outline-none',
                        project.group
                            ? 'text-brand hover:text-brand'
                            : 'text-soft hover:text-ink',
                    )}
                    title={
                        project.group
                            ? `Group: ${project.group} (Click to change)`
                            : 'Assign to project group'
                    }
                    aria-label="Assign to project group"
                >
                    <FolderTree className="size-3.5" />
                </button>
            ) : project.group ? (
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="group inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand ring-1 ring-brand/20 transition hover:bg-brand/15 hover:ring-brand/30 focus:outline-none"
                    title={`Group: ${project.group} (Click to change)`}
                >
                    <FolderTree className="size-3 shrink-0" />
                    <span className="max-w-[120px] truncate">
                        {project.group}
                    </span>
                    <ChevronsUpDown className="size-2.5 opacity-60 transition group-hover:opacity-100" />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-2 py-0.5 text-xs font-normal text-faint transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand focus:outline-none"
                    title="Add to project group"
                >
                    <Plus className="size-3 shrink-0" />
                    <span>Add group</span>
                </button>
            )}

            {/* Dropdown Combobox Menu */}
            {isOpen && (
                <div
                    className={cn(
                        'animate-in fade-in zoom-in-95 absolute top-full z-50 mt-1.5 w-64 rounded-xl bg-surface p-2 shadow-xl ring-1 ring-line duration-100',
                        align === 'right' ? 'right-0' : 'left-0',
                    )}
                >
                    {/* Search / Input Field */}
                    <div className="relative mb-2">
                        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-soft" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleInputKeyDown}
                            placeholder="Search or type group…"
                            className="w-full rounded-lg border border-line bg-paper py-1.5 pr-7 pl-8 text-xs text-ink outline-none placeholder:text-soft focus:border-brand focus:ring-1 focus:ring-brand"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute top-1/2 right-2 -translate-y-1/2 text-soft hover:text-ink"
                            >
                                <X className="size-3" />
                            </button>
                        )}
                    </div>

                    {/* Groups List */}
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                        {/* New Group Creation Option */}
                        {trimmedQuery && !hasExactMatch && (
                            <button
                                type="button"
                                onClick={() => handleSelect(trimmedQuery)}
                                className="flex w-full items-center gap-2 rounded-lg bg-brand/5 px-2.5 py-1.5 text-left text-xs font-medium text-brand transition hover:bg-brand/10"
                            >
                                <Plus className="size-3.5 shrink-0" />
                                <span className="truncate">
                                    Create group "{trimmedQuery}"
                                </span>
                            </button>
                        )}

                        {/* Existing Filtered Groups */}
                        {filteredGroups.map((group) => {
                            const isCurrent = project.group === group;
                            return (
                                <button
                                    key={group}
                                    type="button"
                                    onClick={() => handleSelect(group)}
                                    className={cn(
                                        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition',
                                        isCurrent
                                            ? 'bg-brand/10 font-semibold text-brand'
                                            : 'text-ink hover:bg-paper',
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <FolderTree className="size-3.5 shrink-0 text-soft" />
                                        <span className="truncate">
                                            {group}
                                        </span>
                                    </div>
                                    {isCurrent && (
                                        <Check className="size-3.5 shrink-0 text-brand" />
                                    )}
                                </button>
                            );
                        })}

                        {/* No matches and no query */}
                        {filteredGroups.length === 0 && !trimmedQuery && (
                            <p className="px-2.5 py-2 text-center text-xs text-soft">
                                No groups yet. Type a name above to create one.
                            </p>
                        )}
                    </div>

                    {/* Remove from Group Option */}
                    {project.group && (
                        <div className="mt-1.5 border-t border-line/60 pt-1.5">
                            <button
                                type="button"
                                onClick={() => handleSelect(null)}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-accent transition hover:bg-accent/10"
                            >
                                <FolderMinus className="size-3.5 shrink-0" />
                                <span>Remove from group</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
