/** Swatch tokens a project group's color may be set to — must match App\Models\ProjectGroup::COLORS. */
export const GROUP_COLORS = [
    { key: 'slate', label: 'Slate' },
    { key: 'rose', label: 'Rose' },
    { key: 'orange', label: 'Orange' },
    { key: 'amber', label: 'Amber' },
    { key: 'emerald', label: 'Emerald' },
    { key: 'teal', label: 'Teal' },
    { key: 'sky', label: 'Sky' },
    { key: 'violet', label: 'Violet' },
    { key: 'pink', label: 'Pink' },
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number]['key'];

type GroupColorClasses = {
    /** Icon badge background/text/ring, e.g. the group section's folder icon circle. */
    icon: string;
    /** Solid dot, e.g. a swatch picker option or a small indicator. */
    dot: string;
    /** Chip background/text/ring, e.g. a combobox trigger badge. */
    chip: string;
    /** Whole-card background wash + ring, e.g. the group section's own container. */
    wash: string;
};

const CLASS_MAP: Record<GroupColor, GroupColorClasses> = {
    slate: {
        icon: 'bg-slate-500/10 text-slate-500 ring-slate-500/20',
        dot: 'bg-slate-500',
        chip: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-400',
        wash: 'bg-slate-500/5 ring-slate-500/25',
    },
    rose: {
        icon: 'bg-rose-500/10 text-rose-500 ring-rose-500/20',
        dot: 'bg-rose-500',
        chip: 'bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400',
        wash: 'bg-rose-500/5 ring-rose-500/25',
    },
    orange: {
        icon: 'bg-orange-500/10 text-orange-500 ring-orange-500/20',
        dot: 'bg-orange-500',
        chip: 'bg-orange-500/10 text-orange-600 ring-orange-500/20 dark:text-orange-400',
        wash: 'bg-orange-500/5 ring-orange-500/25',
    },
    amber: {
        icon: 'bg-amber-500/10 text-amber-500 ring-amber-500/20',
        dot: 'bg-amber-500',
        chip: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400',
        wash: 'bg-amber-500/5 ring-amber-500/25',
    },
    emerald: {
        icon: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20',
        dot: 'bg-emerald-500',
        chip: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
        wash: 'bg-emerald-500/5 ring-emerald-500/25',
    },
    teal: {
        icon: 'bg-teal-500/10 text-teal-500 ring-teal-500/20',
        dot: 'bg-teal-500',
        chip: 'bg-teal-500/10 text-teal-600 ring-teal-500/20 dark:text-teal-400',
        wash: 'bg-teal-500/5 ring-teal-500/25',
    },
    sky: {
        icon: 'bg-sky-500/10 text-sky-500 ring-sky-500/20',
        dot: 'bg-sky-500',
        chip: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400',
        wash: 'bg-sky-500/5 ring-sky-500/25',
    },
    violet: {
        icon: 'bg-violet-500/10 text-violet-500 ring-violet-500/20',
        dot: 'bg-violet-500',
        chip: 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400',
        wash: 'bg-violet-500/5 ring-violet-500/25',
    },
    pink: {
        icon: 'bg-pink-500/10 text-pink-500 ring-pink-500/20',
        dot: 'bg-pink-500',
        chip: 'bg-pink-500/10 text-pink-600 ring-pink-500/20 dark:text-pink-400',
        wash: 'bg-pink-500/5 ring-pink-500/25',
    },
};

const DEFAULT_CLASSES: GroupColorClasses = {
    icon: 'bg-brand/10 text-brand ring-brand/20',
    dot: 'bg-brand',
    chip: 'bg-brand/10 text-brand ring-brand/20',
    wash: 'bg-surface/70 ring-line/80',
};

export function groupColorClasses(color?: string | null): GroupColorClasses {
    return color !== null && color !== undefined && color in CLASS_MAP
        ? CLASS_MAP[color as GroupColor]
        : DEFAULT_CLASSES;
}
