import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Lock, Plus, X } from 'lucide-react';
import SelectMenu from '@/components/select-menu';
import { cn } from '@/lib/utils';
import type { FrameworkField, NewAppAnswers } from '@/types/larakube';

const inputClass =
    'w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand';

/**
 * A confirm field's default comes from the CLI as either a real boolean (a
 * FLAG option, always `false`) or a string (a VALUE option standing in for
 * one, e.g. `proxied`'s `'1'`/`'0'` — defaults ON, `--proxied=0` opts out) —
 * never assume it's already a boolean.
 */
function isConfirmedByDefault(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
}

export function defaultAnswers(fields: FrameworkField[]): NewAppAnswers {
    return Object.fromEntries(
        fields.map((field) => [
            field.key,
            field.type === 'multiselect' || field.multiple
                ? []
                : field.type === 'confirm'
                  ? isConfirmedByDefault(field.default)
                  : field.type === 'text'
                    ? ''
                    : (field.suggested ?? field.default ?? null),
        ]),
    );
}

/**
 * Whether every condition holds: an answer equals it, or a multiselect holds
 * it. A list of values means any of them.
 */
function matches(
    conditions: Record<string, string | string[]> | undefined,
    answers: NewAppAnswers,
): boolean {
    return Object.entries(conditions ?? {}).every(([key, expected]) => {
        const answer = answers[key];
        const accepted = Array.isArray(expected) ? expected : [expected];

        return Array.isArray(answer)
            ? answer.some((value) => accepted.includes(value))
            : typeof answer === 'string' && accepted.includes(answer);
    });
}

/** The options a field offers under the chosen server variation. */
function available(field: FrameworkField, server: string | null) {
    return (field.options ?? []).filter(
        (option) =>
            server === null || !(option.unavailableWith ?? []).includes(server),
    );
}

/** "Horizon (with Redis)" → "Horizon": the name without its explanation. */
function shortLabel(label: string): string {
    return label.replace(/\s*\(.*\)\s*$/, '');
}

/** The label of the option an answer picked: `features: horizon` → "Horizon". */
function answerLabel(
    fields: FrameworkField[],
    key: string,
    value: string,
): string {
    const option = fields
        .find((field) => field.key === key)
        ?.options?.find((candidate) => candidate.value === value);

    return shortLabel(option?.label ?? value);
}

/**
 * The value another answer forces on this field (Horizon forces Redis), and
 * the name of that answer, so the choice shows locked instead of silently
 * snapping back.
 */
function forcedChoice(
    fields: FrameworkField[],
    field: FrameworkField,
    answers: NewAppAnswers,
): { value: string; by: string } | null {
    const rule = (field.forcedWhen ?? []).find((candidate) =>
        matches(candidate.when, answers),
    );

    if (!rule) return null;

    const [key, expected] = Object.entries(rule.when)[0] ?? [];

    return {
        value: rule.value,
        by:
            key !== undefined && expected !== undefined
                ? answerLabel(fields, key, expected)
                : 'another choice',
    };
}

/**
 * Options another answer includes on the field's behalf (FrankenPHP includes
 * Octane), keyed by value, with the label of the answer that includes them.
 * They show checked and locked instead of disappearing.
 */
function lockedOptions(
    fields: FrameworkField[],
    answers: NewAppAnswers,
    key: string,
): Record<string, string> {
    const locked: Record<string, string> = {};

    for (const field of fields) {
        const answer = answers[field.key];
        if (typeof answer !== 'string') continue;

        const add = field.implies?.[answer]?.[key];
        if (add === undefined) continue;

        locked[add] = answerLabel(fields, field.key, answer);
    }

    return locked;
}

/**
 * Keeps answers consistent with the rules the CLI sent: choices a server
 * rules out fall back, implied answers are added and forced ones applied.
 */
export function reconcile(
    fields: FrameworkField[],
    answers: NewAppAnswers,
): NewAppAnswers {
    const server = typeof answers.server === 'string' ? answers.server : null;
    const next: NewAppAnswers = { ...answers };

    for (const field of fields) {
        for (const [value, implied] of Object.entries(field.implies ?? {})) {
            if (next[field.key] !== value) continue;

            for (const [key, add] of Object.entries(implied)) {
                const current = next[key];
                next[key] = Array.isArray(current)
                    ? [...new Set([...current, add])]
                    : add;
            }
        }
    }

    for (const field of fields) {
        const forced = (field.forcedWhen ?? []).find((rule) =>
            matches(rule.when, next),
        );

        if (forced) {
            next[field.key] = forced.value;
        }

        if (field.type !== 'select' && field.type !== 'multiselect') continue;

        const values = available(field, server).map((option) => option.value);
        const answer = next[field.key];

        if (Array.isArray(answer)) {
            next[field.key] = answer.filter((value) => values.includes(value));
        } else if (
            typeof answer === 'string' &&
            answer !== '' &&
            !values.includes(answer)
        ) {
            const fallback = field.suggested ?? field.default;
            next[field.key] =
                typeof fallback === 'string' && values.includes(fallback)
                    ? fallback
                    : (values[0] ?? null);
        }
    }

    return next;
}

/**
 * Renders a framework's fields as the CLI described them: what is asked up
 * front, then the rest behind "Advanced". `afterEssential` sits between.
 */
export default function FrameworkFields({
    fields,
    answers,
    errors,
    errorPrefix,
    onChange,
    afterEssential,
    autoFocus = false,
}: {
    fields: FrameworkField[];
    answers: NewAppAnswers;
    errors: Record<string, string>;
    errorPrefix: string;
    onChange: (answers: NewAppAnswers) => void;
    afterEssential?: ReactNode;
    autoFocus?: boolean;
}) {
    const [advanced, setAdvanced] = useState(false);
    const server = typeof answers.server === 'string' ? answers.server : null;
    const visible = fields.filter((field) =>
        matches(field.visibleWhen, answers),
    );
    const essential = visible.filter((field) => field.group !== 'advanced');
    const rest = visible.filter((field) => field.group === 'advanced');

    function set(key: string, value: string | string[] | boolean | null) {
        const before = { ...answers };
        const next = reconcile(fields, { ...answers, [key]: value });

        // A rule that has only now come true suggests a new default (AI implies Postgres).
        for (const field of fields) {
            const rule = (field.defaultWhen ?? []).find(
                (candidate) =>
                    matches(candidate.when, next) &&
                    !matches(candidate.when, before),
            );

            if (rule && field.key !== key) {
                next[field.key] = rule.value;
            }
        }

        onChange(reconcile(fields, next));
    }

    function render(field: FrameworkField, focus: boolean) {
        const error = errors[`${errorPrefix}.${field.key}`];
        const answer = answers[field.key];
        const options = available(field, server);
        const locked = lockedOptions(fields, answers, field.key);
        const forced = forcedChoice(fields, field, answers);
        const forcedLabel = forced
            ? shortLabel(
                  options.find((option) => option.value === forced.value)
                      ?.label ?? forced.value,
              )
            : null;
        const hint = error
            ? undefined
            : forced
              ? `${forced.by} needs ${forcedLabel}. Turn ${forced.by} off to choose another ${field.label.toLowerCase()}.`
              : (field.optionHints?.[String(answer)] ?? field.description);
        const isSmallSelect =
            field.type === 'select' &&
            options.length > 0 &&
            options.length <= 3 &&
            !field.nullable;

        return (
            <div
                key={field.key}
                className={
                    field.type === 'multiselect' ||
                    field.type === 'confirm' ||
                    (field.type === 'text' && field.multiple) ||
                    isSmallSelect
                        ? 'col-span-full'
                        : undefined
                }
            >
                {field.type === 'confirm' ? (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface/50 p-3 text-xs text-soft ring-1 ring-line transition hover:text-ink hover:ring-faint">
                        <input
                            type="checkbox"
                            checked={answer === true}
                            onChange={(event) =>
                                set(field.key, event.target.checked)
                            }
                            className="mt-0.5 size-4 rounded accent-brand"
                        />
                        <div className="space-y-0.5">
                            <span className="block font-medium text-ink">
                                {field.label}
                            </span>
                            {field.description && (
                                <span className="block text-[11px] text-soft">
                                    {field.description}
                                </span>
                            )}
                        </div>
                    </label>
                ) : (
                    <>
                        <span className="mb-1.5 block text-xs font-medium text-soft">
                            {field.label}
                        </span>
                        {field.type === 'text' && field.multiple ? (
                            <div className="space-y-1.5">
                                {(Array.isArray(answer) ? answer : []).map(
                                    (value, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-1.5"
                                        >
                                            <input
                                                type="text"
                                                value={value}
                                                onChange={(event) => {
                                                    const next = [
                                                        ...(Array.isArray(
                                                            answer,
                                                        )
                                                            ? answer
                                                            : []),
                                                    ];
                                                    next[index] =
                                                        event.target.value;
                                                    set(field.key, next);
                                                }}
                                                placeholder={field.placeholder}
                                                autoFocus={focus && index === 0}
                                                spellCheck={false}
                                                className={inputClass}
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    set(
                                                        field.key,
                                                        (Array.isArray(answer)
                                                            ? answer
                                                            : []
                                                        ).filter(
                                                            (_, i) =>
                                                                i !== index,
                                                        ),
                                                    )
                                                }
                                                className="shrink-0 rounded-lg p-2 text-soft hover:bg-badge hover:text-ink"
                                                title="Remove"
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        </div>
                                    ),
                                )}
                                <button
                                    type="button"
                                    onClick={() =>
                                        set(field.key, [
                                            ...(Array.isArray(answer)
                                                ? answer
                                                : []),
                                            '',
                                        ])
                                    }
                                    className="flex items-center gap-1 text-xs font-medium text-soft hover:text-ink"
                                >
                                    <Plus className="size-3" />
                                    <span>Add</span>
                                </button>
                            </div>
                        ) : field.type === 'text' ? (
                            <input
                                type={
                                    field.format === 'email' ? 'email' : 'text'
                                }
                                value={typeof answer === 'string' ? answer : ''}
                                onChange={(event) =>
                                    set(field.key, event.target.value)
                                }
                                placeholder={field.placeholder}
                                autoFocus={focus}
                                spellCheck={false}
                                className={inputClass}
                            />
                        ) : field.type === 'multiselect' ? (
                            <div className="flex flex-wrap gap-2">
                                {(field.options ?? [])
                                    .filter(
                                        (option) =>
                                            option.value in locked ||
                                            options.includes(option),
                                    )
                                    .map((option) => {
                                        const current = Array.isArray(answer)
                                            ? answer
                                            : [];
                                        const lockedBy = locked[option.value];

                                        if (lockedBy !== undefined) {
                                            return (
                                                <span
                                                    key={option.value}
                                                    title={`Included with ${lockedBy}`}
                                                    aria-disabled="true"
                                                    className="inline-flex cursor-not-allowed items-center gap-1 rounded-full bg-brand/80 px-3 py-1 text-xs text-white"
                                                >
                                                    <Lock className="size-3" />
                                                    {option.label}
                                                    <span className="text-white/75">
                                                        · with {lockedBy}
                                                    </span>
                                                </span>
                                            );
                                        }

                                        const selected = current.includes(
                                            option.value,
                                        );

                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() =>
                                                    set(
                                                        field.key,
                                                        selected
                                                            ? current.filter(
                                                                  (value) =>
                                                                      value !==
                                                                      option.value,
                                                              )
                                                            : [
                                                                  ...current,
                                                                  option.value,
                                                              ],
                                                    )
                                                }
                                                className={cn(
                                                    'rounded-full px-3 py-1 text-xs transition',
                                                    selected
                                                        ? 'bg-brand text-white'
                                                        : 'bg-surface ring-1 ring-line ring-inset hover:ring-faint',
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                            </div>
                        ) : isSmallSelect ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {options.map((option) => {
                                    const currentVal =
                                        typeof answer === 'string'
                                            ? answer
                                            : typeof field.default === 'string'
                                              ? field.default
                                              : '';
                                    const selected = forced
                                        ? forced.value === option.value
                                        : currentVal === option.value;
                                    const blocked =
                                        forced !== null && !selected;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            disabled={forced !== null}
                                            aria-disabled={forced !== null}
                                            title={
                                                forced
                                                    ? selected
                                                        ? `Included with ${forced.by}`
                                                        : `${forced.by} needs ${forcedLabel}`
                                                    : undefined
                                            }
                                            onClick={() =>
                                                set(field.key, option.value)
                                            }
                                            className={cn(
                                                'flex items-center justify-between rounded-xl p-3 text-left ring-1 transition',
                                                forced
                                                    ? 'cursor-not-allowed'
                                                    : 'cursor-pointer',
                                                selected
                                                    ? 'bg-brand/10 font-medium text-ink ring-2 ring-brand'
                                                    : 'bg-surface text-soft ring-line',
                                                !selected &&
                                                    !blocked &&
                                                    'hover:text-ink hover:ring-faint',
                                                blocked && 'opacity-50',
                                            )}
                                        >
                                            <span className="text-xs font-semibold text-ink">
                                                {option.label}
                                                {selected && forced && (
                                                    <span className="font-normal text-soft">
                                                        {' '}
                                                        · with {forced.by}
                                                    </span>
                                                )}
                                            </span>
                                            {selected &&
                                                (forced ? (
                                                    <Lock className="ml-1.5 size-3.5 shrink-0 text-brand" />
                                                ) : (
                                                    <Check className="ml-1.5 size-3.5 shrink-0 text-brand" />
                                                ))}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : forced ? (
                            <div
                                aria-disabled="true"
                                title={`Included with ${forced.by}`}
                                className={cn(
                                    inputClass,
                                    'flex cursor-not-allowed items-center gap-2',
                                )}
                            >
                                <Lock className="size-3.5 shrink-0 text-brand" />
                                <span className="text-ink">{forcedLabel}</span>
                                <span className="text-soft">
                                    · with {forced.by}
                                </span>
                            </div>
                        ) : (
                            <SelectMenu
                                value={
                                    typeof answer === 'string'
                                        ? answer
                                        : typeof field.default === 'string'
                                          ? field.default
                                          : ''
                                }
                                triggerClassName={inputClass}
                                onChange={(value) =>
                                    set(field.key, value || null)
                                }
                                options={[
                                    ...(field.nullable
                                        ? [{ value: '', label: 'None' }]
                                        : []),
                                    ...options.map((option) => ({
                                        value: option.value,
                                        label: option.label,
                                    })),
                                ]}
                            />
                        )}
                    </>
                )}
                {(error || (field.type !== 'confirm' && hint)) && (
                    <span
                        className={cn(
                            'mt-1 block text-xs',
                            error ? 'text-accent' : 'text-soft',
                        )}
                    >
                        {error ?? hint}
                    </span>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2">
                {essential.map((field, index) =>
                    render(field, autoFocus && index === 0),
                )}
            </div>
            {afterEssential}
            {rest.length > 0 && (
                <>
                    <button
                        type="button"
                        onClick={() => setAdvanced(!advanced)}
                        className="text-xs font-medium text-soft hover:text-ink"
                    >
                        {advanced
                            ? 'Hide advanced options ▴'
                            : 'Advanced options ▾'}
                    </button>
                    {advanced && (
                        <div className="grid grid-cols-2 gap-4">
                            {rest.map((field) => render(field, false))}
                        </div>
                    )}
                </>
            )}
        </>
    );
}
