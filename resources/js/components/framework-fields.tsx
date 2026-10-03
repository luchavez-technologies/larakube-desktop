import { useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { FrameworkField, NewAppAnswers } from '@/types/larakube';

const inputClass =
    'w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand';

export function defaultAnswers(fields: FrameworkField[]): NewAppAnswers {
    return Object.fromEntries(
        fields.map((field) => [
            field.key,
            field.type === 'multiselect'
                ? []
                : field.type === 'confirm'
                  ? field.default === true
                  : field.type === 'text'
                    ? ''
                    : (field.suggested ?? field.default ?? null),
        ]),
    );
}

/** Whether every condition holds: an answer equals it, or a multiselect holds it. */
function matches(
    conditions: Record<string, string> | undefined,
    answers: NewAppAnswers,
): boolean {
    return Object.entries(conditions ?? {}).every(([key, expected]) => {
        const answer = answers[key];

        return Array.isArray(answer)
            ? answer.includes(expected)
            : answer === expected;
    });
}

/** The options a field offers under the chosen server variation. */
function available(field: FrameworkField, server: string | null) {
    return (field.options ?? []).filter(
        (option) =>
            server === null || !(option.unavailableWith ?? []).includes(server),
    );
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
        const hint = error
            ? undefined
            : (field.optionHints?.[String(answer)] ?? field.description);

        return (
            <div
                key={field.key}
                className={
                    field.type === 'multiselect' ? 'col-span-2' : undefined
                }
            >
                {field.type === 'confirm' ? (
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={answer === true}
                            onChange={(event) =>
                                set(field.key, event.target.checked)
                            }
                        />
                        {field.label}
                    </label>
                ) : (
                    <>
                        <span className="mb-1.5 block text-xs font-medium text-soft">
                            {field.label}
                        </span>
                        {field.type === 'text' ? (
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
                                {options.map((option) => {
                                    const current = Array.isArray(answer)
                                        ? answer
                                        : [];
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
                        ) : (
                            <select
                                value={typeof answer === 'string' ? answer : ''}
                                onChange={(event) =>
                                    set(field.key, event.target.value || null)
                                }
                                className={inputClass}
                            >
                                {field.nullable && (
                                    <option value="">None</option>
                                )}
                                {options.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </>
                )}
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
