import { useState } from 'react';
import { Key, Plus, Trash2 } from 'lucide-react';
import type { FrameworkField, NewAppAnswers } from '@/types/larakube';

type Row = { key: string; value: string; secret: boolean };

const inputClass =
    'w-full rounded-lg border-0 bg-surface px-3 py-2 font-mono text-xs ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-brand';

function parseRows(entries: unknown, secret: boolean): Row[] {
    return (Array.isArray(entries) ? entries : []).map((entry) => {
        const raw = String(entry);
        const index = raw.indexOf('=');

        return index > 0
            ? { key: raw.slice(0, index), value: raw.slice(index + 1), secret }
            : { key: raw, value: '', secret };
    });
}

/**
 * `customEnv`/`customEnvSecret` are rendered by <CustomEnvFields> instead of
 * the generic initFields-driven form — every caller that hands fields to
 * FrameworkFields (the Install dialog, Quick Launch, and anywhere else that
 * adopts this same initFields pipeline later, e.g. an "Update App" config
 * editor) excludes them the same way, via this one helper, so the exclusion
 * can never drift between call sites.
 */
export function excludeCustomEnvFields(
    fields: FrameworkField[],
): FrameworkField[] {
    return fields.filter(
        (field) => field.key !== 'customEnv' && field.key !== 'customEnvSecret',
    );
}

/**
 * KEY/VALUE/secret-toggle editor for a tool's `customEnv`/`customEnvSecret`
 * init options — the Install-dialog counterpart to ToolEnvCard's post-
 * install editor, letting a person inject their own vars (an external mail/
 * DB service's settings, a feature flag) at the very first deploy. Only
 * renders when the CLI's own initFields spec actually offers these two
 * fields (ADR 0010) — it isn't hardcoded to any particular tool.
 */
export default function CustomEnvFields({
    fields,
    answers,
    onChange,
}: {
    fields: FrameworkField[];
    answers: NewAppAnswers;
    onChange: (answers: NewAppAnswers) => void;
}) {
    const [rows, setRows] = useState<Row[]>(() => [
        ...parseRows(answers.customEnv, false),
        ...parseRows(answers.customEnvSecret, true),
    ]);

    const offersCustomEnv = fields.some(
        (field) => field.key === 'customEnv' || field.key === 'customEnvSecret',
    );

    function commit(nextRows: Row[]) {
        setRows(nextRows);
        onChange({
            ...answers,
            customEnv: nextRows
                .filter((row) => !row.secret && row.key.trim() !== '')
                .map((row) => `${row.key}=${row.value}`),
            customEnvSecret: nextRows
                .filter((row) => row.secret && row.key.trim() !== '')
                .map((row) => `${row.key}=${row.value}`),
        });
    }

    function updateRow(index: number, patch: Partial<Row>) {
        commit(
            rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        );
    }

    function removeRow(index: number) {
        commit(rows.filter((_, i) => i !== index));
    }

    if (!offersCustomEnv) {
        return null;
    }

    return (
        <div className="col-span-full space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
            <div>
                <span className="block text-xs font-medium text-ink">
                    Custom Environment Variables
                </span>
                <span className="block text-[11px] text-soft">
                    Your own vars layered on top of this app — an external
                    mail/DB service&rsquo;s settings, a feature flag — never a
                    key the install itself manages.
                </span>
            </div>

            {rows.length > 0 && (
                <div className="space-y-1.5">
                    {rows.map((row, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                            {row.secret && (
                                <Key className="size-3.5 shrink-0 text-faint" />
                            )}
                            <input
                                type="text"
                                value={row.key}
                                onChange={(event) =>
                                    updateRow(index, {
                                        key: event.target.value
                                            .trim()
                                            .toUpperCase()
                                            .replace(/\s+/g, '_'),
                                    })
                                }
                                placeholder="KEY"
                                spellCheck={false}
                                className={`${inputClass} w-2/5`}
                            />
                            <input
                                type="text"
                                value={row.value}
                                onChange={(event) =>
                                    updateRow(index, {
                                        value: event.target.value,
                                    })
                                }
                                placeholder="value"
                                spellCheck={false}
                                className={inputClass}
                            />
                            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-soft">
                                <input
                                    type="checkbox"
                                    checked={row.secret}
                                    onChange={(event) =>
                                        updateRow(index, {
                                            secret: event.target.checked,
                                        })
                                    }
                                    className="rounded border-line text-brand focus:ring-brand"
                                />
                                Secret
                            </label>
                            <button
                                type="button"
                                onClick={() => removeRow(index)}
                                className="shrink-0 rounded-lg p-2 text-soft hover:bg-badge hover:text-accent"
                                title="Remove"
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <button
                type="button"
                onClick={() =>
                    commit([...rows, { key: '', value: '', secret: false }])
                }
                className="flex items-center gap-1 text-xs font-medium text-soft hover:text-ink"
            >
                <Plus className="size-3" />
                <span>Add Variable</span>
            </button>
        </div>
    );
}
