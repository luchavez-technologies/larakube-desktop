import { ChevronLeft, ChevronRight, Code2, Database, Zap } from 'lucide-react';
import Button from '@/components/button';
import { cn } from '@/lib/utils';
import type { SimulatorHop } from './types';

export default function StepInspector({
    hop,
    stepIndex,
    totalSteps,
    onNext,
    onPrev,
    hasNext,
    hasPrev,
    isFailed,
}: {
    hop: SimulatorHop;
    stepIndex: number;
    totalSteps: number;
    onNext: () => void;
    onPrev: () => void;
    hasNext: boolean;
    hasPrev: boolean;
    isFailed?: boolean;
}) {
    return (
        <div className="flex flex-col rounded-2xl border border-line bg-surface/95 p-4 shadow-xl backdrop-blur-md">
            {/* Top Header */}
            <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            'flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-bold text-white shadow-2xs',
                            isFailed ? 'bg-rose-600' : 'bg-brand',
                        )}
                    >
                        Hop {stepIndex + 1} / {totalSteps}
                    </span>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-ink">
                                {hop.title}
                            </span>
                            <span
                                className={cn(
                                    'py-0.2 rounded px-1.5 font-mono text-[9px] font-medium uppercase',
                                    isFailed
                                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                        : 'bg-badge text-soft',
                                )}
                            >
                                {hop.layer}
                            </span>
                        </div>
                        <p className="font-mono text-[10px] text-soft">
                            {hop.subtitle}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onPrev}
                        disabled={!hasPrev}
                        title="Previous step"
                    >
                        <ChevronLeft className="size-3.5" />
                        <span>Prev</span>
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onNext}
                        disabled={!hasNext}
                        title="Next step"
                    >
                        <span>Next</span>
                        <ChevronRight className="size-3.5" />
                    </Button>
                </div>
            </div>

            {/* Summary */}
            <div className="mt-3">
                <p className="text-xs leading-relaxed font-medium text-ink">
                    {hop.summary}
                </p>
            </div>

            {/* Under the hood mechanics list */}
            <div className="mt-3 space-y-1.5">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                    <Zap className="size-3 text-brand" /> Under the Hood
                </span>
                <div className="space-y-1 rounded-xl border border-line/60 bg-paper/60 p-2.5">
                    {hop.mechanics.map((item, idx) => (
                        <div
                            key={idx}
                            className="flex items-start gap-2 text-[11px] leading-relaxed text-soft"
                        >
                            <span className="font-bold text-brand">•</span>
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Technical Parameters Box */}
            <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-line bg-paper/40 p-2 text-center">
                    <span className="text-[9px] font-semibold text-faint uppercase">
                        Protocol
                    </span>
                    <div className="truncate font-mono text-[10.5px] font-medium text-ink">
                        {hop.technicalDetails.protocol}
                    </div>
                </div>
                <div className="rounded-lg border border-line bg-paper/40 p-2 text-center">
                    <span className="text-[9px] font-semibold text-faint uppercase">
                        Port
                    </span>
                    <div className="truncate font-mono text-[10.5px] font-medium text-ink">
                        {hop.technicalDetails.port}
                    </div>
                </div>
                <div className="rounded-lg border border-line bg-paper/40 p-2 text-center">
                    <span className="text-[9px] font-semibold text-faint uppercase">
                        Latency
                    </span>
                    <div className="truncate font-mono text-[10.5px] font-medium text-ink">
                        {hop.technicalDetails.latencyMs} ms
                    </div>
                </div>
            </div>

            {/* Headers or SQL Query Preview */}
            {hop.technicalDetails.query && (
                <div className="mt-3">
                    <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                        <Database className="size-3 text-tools" /> SQL Query
                    </span>
                    <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-term p-2 font-mono text-[10px] text-term-text">
                        <code>{hop.technicalDetails.query}</code>
                    </pre>
                </div>
            )}

            {hop.technicalDetails.headers && (
                <div className="mt-3">
                    <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                        <Code2 className="size-3 text-brand" /> Transport
                        Headers
                    </span>
                    <div className="mt-1 max-h-24 overflow-y-auto rounded-lg border border-line bg-term p-2 font-mono text-[9.5px]">
                        {Object.entries(hop.technicalDetails.headers).map(
                            ([key, val]) => (
                                <div key={key} className="truncate">
                                    <span className="text-term-dim">
                                        {key}:{' '}
                                    </span>
                                    <span className="text-term-bright">
                                        {val}
                                    </span>
                                </div>
                            ),
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
