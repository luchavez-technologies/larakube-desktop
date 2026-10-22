import { useState, useEffect } from 'react';
import { Check, FolderTree, FolderMinus, X, XCircle } from 'lucide-react';
import Button, { buttonClass } from '@/components/button';
import type { Project } from '@/types/larakube';

export default function AssignGroupModal({
    project,
    isOpen,
    onClose,
    existingGroups,
    onAssign,
}: {
    project: Project | null;
    isOpen: boolean;
    onClose: () => void;
    existingGroups: string[];
    onAssign: (projectId: number, group: string | null) => void;
}) {
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        if (project) {
            setGroupName(project.group ?? '');
        }
    }, [project]);

    if (!isOpen || !project) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = groupName.trim();
        onAssign(project.id, trimmed ? trimmed : null);
        onClose();
    };

    const handleSelectExisting = (group: string) => {
        onAssign(project.id, group);
        onClose();
    };

    const handleRemoveFromGroup = () => {
        onAssign(project.id, null);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="animate-in fade-in zoom-in-95 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-line duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-line/60 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                            <FolderTree className="size-4.5" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-ink">
                                Organize Codebase
                            </h3>
                            <p className="text-xs text-soft">{project.name}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-soft hover:bg-paper hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    {/* Existing Groups Picker */}
                    {existingGroups.length > 0 && (
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-soft">
                                Assign to existing group:
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {existingGroups.map((group) => {
                                    const isCurrent = project.group === group;
                                    return (
                                        <button
                                            key={group}
                                            type="button"
                                            onClick={() =>
                                                handleSelectExisting(group)
                                            }
                                            className={
                                                isCurrent
                                                    ? 'inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-xs'
                                                    : 'inline-flex items-center gap-1.5 rounded-lg bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line/60 transition hover:bg-surface hover:ring-brand/50'
                                            }
                                        >
                                            <FolderTree className="size-3.5" />
                                            <span>{group}</span>
                                            {isCurrent && (
                                                <Check className="size-3" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* New / Custom Group Input */}
                    <div>
                        <label
                            htmlFor="group-input"
                            className="mb-1.5 block text-xs font-medium text-soft"
                        >
                            {existingGroups.length > 0
                                ? 'Or enter a group name:'
                                : 'Enter project group name (e.g. Shop, Portal):'}
                        </label>
                        <div className="relative">
                            <input
                                id="group-input"
                                type="text"
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                placeholder="e.g. Acme Shop"
                                autoFocus
                                className="h-9 w-full rounded-xl bg-paper px-3 text-sm text-ink ring-1 ring-line transition outline-none focus:ring-2 focus:ring-brand"
                            />
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-2">
                        {project.group ? (
                            <button
                                type="button"
                                onClick={handleRemoveFromGroup}
                                className={buttonClass('danger', 'sm')}
                            >
                                <FolderMinus className="size-3.5" />
                                <span>Remove from group</span>
                            </button>
                        ) : (
                            <div />
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className={buttonClass('secondary', 'sm')}
                            >
                                <XCircle className="size-3.5" />
                                <span>Cancel</span>
                            </button>
                            <Button type="submit" variant="primary" size="sm">
                                <Check className="size-3.5" />
                                <span>Save</span>
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
