import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'cards' | 'table';

export default function ViewToggle({
    mode,
    onChange,
}: {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
}) {
    return (
        <div className="inline-flex h-9 items-center rounded-lg border border-line bg-surface p-1">
            <button
                type="button"
                onClick={() => onChange('cards')}
                className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    mode === 'cards'
                        ? 'bg-ink text-surface shadow-xs'
                        : 'text-soft hover:text-ink'
                }`}
                title="Cards view"
                aria-label="Cards view"
            >
                <LayoutGrid className="size-3.5" />
                <span>Cards</span>
            </button>
            <button
                type="button"
                onClick={() => onChange('table')}
                className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    mode === 'table'
                        ? 'bg-ink text-surface shadow-xs'
                        : 'text-soft hover:text-ink'
                }`}
                title="Table view"
                aria-label="Table view"
            >
                <List className="size-3.5" />
                <span>Table</span>
            </button>
        </div>
    );
}
