import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

export type StickyTabItem<T extends string = string> = {
    id: T;
    label: string;
    icon: ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeTone?: 'default' | 'warn';
    tone?: 'default' | 'danger';
};

type StickyTabsProps<T extends string = string> = {
    tabs: Array<StickyTabItem<T>>;
    activeTab: T;
    onChange: (id: T) => void;
    /** Bleed horizontally across AppLayout `<main>` padding for full-bleed pages like Settings. */
    bleed?: boolean;
    className?: string;
};

export default function StickyTabs<T extends string = string>({
    tabs,
    activeTab,
    onChange,
    bleed = false,
    className,
}: StickyTabsProps<T>) {
    return (
        <div
            className={cn(
                'sticky top-0 z-20 flex border-b border-line bg-paper',
                bleed
                    ? '-mx-6 px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10'
                    : '-mx-2 px-2',
                className,
            )}
        >
            <nav className="flex flex-wrap gap-1" aria-label="Tabs">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    const isDanger = tab.tone === 'danger';
                    const isWarnBadge = tab.badgeTone === 'warn';

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChange(tab.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                                'relative flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-medium transition',
                                isActive
                                    ? isDanger
                                        ? 'text-accent'
                                        : 'text-brand'
                                    : isDanger
                                      ? 'text-accent/80 hover:text-accent'
                                      : 'text-soft hover:text-ink',
                            )}
                        >
                            <Icon className="size-4 shrink-0" />
                            <span>{tab.label}</span>
                            {tab.badge !== undefined && (
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                        isWarnBadge
                                            ? 'bg-warn-tint text-warn'
                                            : isActive
                                              ? 'bg-brand/10 text-brand'
                                              : 'bg-badge text-soft',
                                    )}
                                >
                                    {tab.badge}
                                </span>
                            )}
                            {isActive && (
                                <div
                                    className={cn(
                                        'absolute inset-x-0 bottom-0 h-0.5',
                                        isDanger ? 'bg-accent' : 'bg-brand',
                                    )}
                                />
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
