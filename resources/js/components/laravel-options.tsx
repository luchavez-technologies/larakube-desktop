import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { NewAppAnswers, NewAppQuestion } from '@/types/larakube';

/** Asked up front; everything else sits behind "Advanced". */
const ESSENTIAL = ['frontend', 'database'];

export function defaultAnswers(questions: NewAppQuestion[]): NewAppAnswers {
    return Object.fromEntries(
        questions.map((question) => [
            question.key,
            question.multiple ? [] : question.default,
        ]),
    );
}

/** The options a question offers under the chosen server variation. */
function available(question: NewAppQuestion, server: string | null) {
    return question.options.filter(
        (option) => server === null || !option.unavailableWith.includes(server),
    );
}

/**
 * Keeps answers valid when the server changes: FrankenPHP rules out SQLite
 * and implies Octane, so those fall back to the default or drop out.
 */
export function reconcile(
    questions: NewAppQuestion[],
    answers: NewAppAnswers,
): NewAppAnswers {
    const server = typeof answers.server === 'string' ? answers.server : null;
    const next: NewAppAnswers = { ...answers };

    for (const question of questions) {
        const values = available(question, server).map(
            (option) => option.value,
        );
        const answer = next[question.key];

        if (Array.isArray(answer)) {
            next[question.key] = answer.filter((value) =>
                values.includes(value),
            );
        } else if (answer !== null && !values.includes(answer)) {
            next[question.key] =
                question.default !== null && values.includes(question.default)
                    ? question.default
                    : (values[0] ?? null);
        }
    }

    return next;
}

export default function LaravelOptions({
    questions,
    answers,
    errors,
    onChange,
}: {
    questions: NewAppQuestion[];
    answers: NewAppAnswers;
    errors: Record<string, string>;
    onChange: (answers: NewAppAnswers) => void;
}) {
    const [advanced, setAdvanced] = useState(false);
    const server = typeof answers.server === 'string' ? answers.server : null;
    const features = Array.isArray(answers.features) ? answers.features : [];
    const visible = questions.filter(
        (question) =>
            !question.requiresFeature ||
            features.includes(question.requiresFeature),
    );

    function set(key: string, value: string | string[] | null) {
        onChange(reconcile(questions, { ...answers, [key]: value }));
    }

    function render(question: NewAppQuestion) {
        const options = available(question, server);
        const error = errors[`laravel.${question.key}`];

        return (
            <div key={question.key}>
                <span className="mb-1.5 block text-xs font-medium text-soft">
                    {question.label}
                </span>
                {question.multiple ? (
                    <div className="flex flex-wrap gap-2">
                        {options.map((option) => {
                            const selected = (
                                (answers[question.key] as string[]) ?? []
                            ).includes(option.value);

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() =>
                                        set(
                                            question.key,
                                            selected
                                                ? (
                                                      answers[
                                                          question.key
                                                      ] as string[]
                                                  ).filter(
                                                      (value) =>
                                                          value !==
                                                          option.value,
                                                  )
                                                : [
                                                      ...((answers[
                                                          question.key
                                                      ] as string[]) ?? []),
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
                        value={(answers[question.key] as string | null) ?? ''}
                        onChange={(event) =>
                            set(question.key, event.target.value || null)
                        }
                        className="w-full rounded-lg border-0 bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
                    >
                        {question.nullable && <option value="">None</option>}
                        {options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                )}
                {error && (
                    <span className="mt-1 block text-xs text-accent">
                        {error}
                    </span>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-2 gap-4">
                {visible
                    .filter((question) => ESSENTIAL.includes(question.key))
                    .map(render)}
            </div>
            {errors['laravel.database'] === undefined &&
                answers.database === 'postgres' && (
                    <p className="text-xs text-soft">
                        PostgreSQL joins the shared Plex Commons database when
                        one is running, instead of starting its own.
                    </p>
                )}
            <button
                type="button"
                onClick={() => setAdvanced(!advanced)}
                className="text-xs font-medium text-soft hover:text-ink"
            >
                {advanced ? 'Hide advanced options ▴' : 'Advanced options ▾'}
            </button>
            {advanced && (
                <div className="grid grid-cols-2 gap-4">
                    {visible
                        .filter((question) => !ESSENTIAL.includes(question.key))
                        .map((question) => (
                            <div
                                key={question.key}
                                className={
                                    question.multiple ? 'col-span-2' : undefined
                                }
                            >
                                {render(question)}
                            </div>
                        ))}
                </div>
            )}
        </>
    );
}
