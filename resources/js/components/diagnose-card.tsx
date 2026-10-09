import {
    AlertTriangle,
    ArrowUpCircle,
    CheckCircle2,
    Wrench,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { DiagnoseReport } from '@/types/larakube';

/**
 * "Why is my cluster unhealthy", in plain language, instead of a dead end
 * once a server stops answering. Node pressure, OOM kills, and pods stuck
 * Pending for lack of room are the exact symptoms of installing something
 * too heavy for too small a server — the one gap nothing else on this page
 * explained before.
 */
export default function DiagnoseCard({
    diagnosis,
    unreachable,
    onRepair,
    onResize,
}: {
    diagnosis?: DiagnoseReport | null;
    unreachable: boolean;
    onRepair: () => void;
    onResize: () => void;
}) {
    const issues = diagnosis?.issues ?? [];
    const hasIssues = issues.length > 0;
    const showActions = unreachable || hasIssues;

    return (
        <Card label="Diagnose" tone={showActions ? 'warn' : 'default'}>
            {diagnosis == null && (
                <p className="text-[13px] leading-relaxed text-soft">
                    {unreachable
                        ? "This server isn't answering, so LaraKube can't read its cluster to explain why. Repair is safe to run even if nothing turns out to be wrong."
                        : "Couldn't check right now."}
                </p>
            )}
            {diagnosis != null && !hasIssues && (
                <p className="flex items-center gap-2 text-[13px] text-soft">
                    <CheckCircle2 className="size-4 shrink-0 text-ok" />
                    <span>
                        No node pressure, out-of-memory kills, or scheduling
                        failures found.
                    </span>
                </p>
            )}
            {hasIssues && (
                <ul className="flex flex-col gap-2.5">
                    {issues.map((issue, index) => (
                        <li
                            key={index}
                            className="rounded-lg bg-surface/60 p-3 ring-1 ring-warn-line"
                        >
                            <p className="flex items-start gap-2 text-sm font-semibold text-warn">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <span>{issue.title}</span>
                            </p>
                            <p className="mt-1 pl-6 text-xs leading-relaxed text-soft">
                                {issue.description}
                            </p>
                            <p className="mt-1.5 pl-6 text-xs leading-relaxed text-ink">
                                {issue.fix}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            {showActions && (
                <div className="mt-4 flex gap-2.5">
                    <Button variant="secondary" size="sm" onClick={onRepair}>
                        <Wrench className="size-3.5" />
                        <span>Repair</span>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={onResize}>
                        <ArrowUpCircle className="size-3.5" />
                        <span>Resize</span>
                    </Button>
                </div>
            )}
        </Card>
    );
}
