import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Code2,
    Database,
    X,
    Zap,
} from 'lucide-react';
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
    onClose,
}: {
    hop: SimulatorHop;
    stepIndex: number;
    totalSteps: number;
    onNext: () => void;
    onPrev: () => void;
    hasNext: boolean;
    hasPrev: boolean;
    isFailed?: boolean;
    onClose?: () => void;
}) {
    return (
        <div className="flex h-full flex-col bg-surface select-text">
            {/* Top Header Bar */}
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            'rounded-md px-2 py-0.5 font-mono text-xs font-bold text-white shadow-2xs',
                            isFailed ? 'bg-rose-600' : 'bg-brand',
                        )}
                    >
                        Hop {stepIndex + 1}/{totalSteps}
                    </span>
                    <span className="font-mono text-[10px] font-semibold tracking-wider text-soft uppercase">
                        {hop.layer}
                    </span>
                </div>

                <div className="flex items-center gap-1">
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
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="hover:bg-hover ml-1 rounded-lg p-1 text-soft transition hover:text-ink"
                            title="Close drawer"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {/* Title & Role */}
                <div>
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-ink">
                            {hop.title}
                        </h3>
                        <span
                            className={cn(
                                'rounded px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase',
                                isFailed
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                    : 'bg-badge text-soft',
                            )}
                        >
                            {hop.badge}
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-soft">{hop.subtitle}</p>
                </div>

                {/* Plain-English Summary */}
                <div className="rounded-xl border border-line bg-paper/60 p-3">
                    <p className="text-xs leading-relaxed font-medium text-ink">
                        {hop.summary}
                    </p>
                </div>

                {/* Mechanics List */}
                <div className="space-y-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-soft uppercase">
                        <Zap className="size-3 text-brand" /> Mechanics
                    </span>
                    <div className="space-y-1.5 rounded-xl border border-line/60 bg-paper/30 p-2.5">
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

                {/* Technical Parameters Grid */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-line bg-paper/40 p-2 text-center">
                        <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
                            Protocol
                        </span>
                        <div className="truncate font-mono text-[10.5px] font-medium text-ink">
                            {hop.technicalDetails.protocol}
                        </div>
                    </div>
                    <div className="rounded-lg border border-line bg-paper/40 p-2 text-center">
                        <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
                            Port
                        </span>
                        <div className="truncate font-mono text-[10.5px] font-medium text-ink">
                            {hop.technicalDetails.port}
                        </div>
                    </div>
                    <div className="rounded-lg border border-line bg-paper/40 p-2 text-center">
                        <span className="text-[9px] font-semibold tracking-wider text-faint uppercase">
                            Latency
                        </span>
                        <div className="truncate font-mono text-[10.5px] font-medium text-ink">
                            {hop.technicalDetails.latencyMs} ms
                        </div>
                    </div>
                </div>

                {/* Expandable Details for Headers and Query */}
                {(hop.technicalDetails.headers ||
                    hop.technicalDetails.query ||
                    hop.technicalDetails.payload) && (
                    <details className="group rounded-xl border border-line bg-paper/30 p-2.5 text-xs transition">
                        <summary className="flex cursor-pointer items-center justify-between font-medium text-soft hover:text-ink">
                            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider uppercase">
                                <Code2 className="size-3 text-brand" />
                                <span>Payload & Headers</span>
                            </span>
                            <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
                        </summary>

                        <div className="mt-2.5 space-y-2.5 border-t border-line/60 pt-2">
                            {hop.technicalDetails.query && (
                                <div>
                                    <span className="flex items-center gap-1 text-[9.5px] font-semibold tracking-wider text-soft uppercase">
                                        <Database className="size-3 text-tools" />{' '}
                                        SQL Query
                                    </span>
                                    <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-term p-2 font-mono text-[10px] text-term-text">
                                        <code>
                                            {hop.technicalDetails.query}
                                        </code>
                                    </pre>
                                </div>
                            )}

                            {hop.technicalDetails.payload && (
                                <div>
                                    <span className="text-[9.5px] font-semibold tracking-wider text-soft uppercase">
                                        Payload Output
                                    </span>
                                    <div className="mt-1 rounded-lg border border-line bg-term p-2 font-mono text-[9.5px] text-term-bright">
                                        {hop.technicalDetails.payload}
                                    </div>
                                </div>
                            )}

                            {hop.technicalDetails.headers && (
                                <div>
                                    <span className="text-[9.5px] font-semibold tracking-wider text-soft uppercase">
                                        HTTP Headers
                                    </span>
                                    <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-line bg-term p-2 font-mono text-[9.5px]">
                                        {Object.entries(
                                            hop.technicalDetails.headers,
                                        ).map(([key, val]) => (
                                            <div key={key} className="truncate">
                                                <span className="text-term-dim">
                                                    {key}:{' '}
                                                </span>
                                                <span className="text-term-bright">
                                                    {val}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}
