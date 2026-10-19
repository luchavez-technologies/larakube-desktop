import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Flame,
    HelpCircle,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Zap,
} from 'lucide-react';
import Button from '@/components/button';
import { cn } from '@/lib/utils';
import type {
    ProjectPreset,
    ScenarioKind,
    SimulatorProject,
    SimulatorScenario,
} from './types';

const SCENARIO_LABELS: Record<string, string> = {
    healthy_web: 'Web 200',
    healthy_api: 'API JSON',
    cached_asset: 'Cache 304',
    fault_database: 'DB Crash (500)',
    fault_pod: 'Pod Down (502)',
    not_found: '404 Missing',
};

function getScenarioIcon(scenario: SimulatorScenario) {
    if (scenario.id === 'cached_asset') {
        return <RotateCw className="size-3 text-brand" />;
    }
    if (scenario.id === 'healthy_api') {
        return <Zap className="size-3 text-brand" />;
    }
    if (scenario.id === 'fault_database') {
        return <Flame className="size-3 text-rose-500" />;
    }
    if (scenario.id === 'fault_pod') {
        return <AlertTriangle className="size-3 text-amber-500" />;
    }
    if (scenario.id === 'not_found') {
        return <HelpCircle className="size-3 text-amber-500" />;
    }
    return <CheckCircle2 className="size-3 text-ok" />;
}

export default function SimulatorControls({
    scenarios,
    currentScenarioKey,
    onSelectScenario,
    isPlaying,
    onTogglePlay,
    onReset,
    speed,
    onChangeSpeed,
    projects,
    presets,
    selectedTargetId,
    onSelectTarget,
    currentStepIndex,
    totalSteps,
    onNext,
    onPrev,
}: {
    scenarios: SimulatorScenario[];
    currentScenarioKey: string;
    onSelectScenario: (key: ScenarioKind) => void;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onReset: () => void;
    speed: number;
    onChangeSpeed: (spd: number) => void;
    projects: SimulatorProject[];
    presets: ProjectPreset[];
    selectedTargetId: string;
    onSelectTarget: (id: string) => void;
    currentStepIndex: number;
    totalSteps: number;
    onNext: () => void;
    onPrev: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 px-3.5 py-2.5 shadow-md backdrop-blur-md">
            {/* Left: Target App / Preset Selector */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold tracking-wider text-soft uppercase">
                    Workload:
                </span>
                <select
                    value={selectedTargetId}
                    onChange={(e) => onSelectTarget(e.target.value)}
                    className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink transition focus:border-brand focus:outline-hidden"
                >
                    <optgroup label="Educational Presets">
                        {presets.map((p) => (
                            <option key={p.id} value={`preset:${p.id}`}>
                                {p.name}
                            </option>
                        ))}
                    </optgroup>
                    {projects.length > 0 && (
                        <optgroup label="My Registered Projects">
                            {projects.map((p) => (
                                <option key={p.id} value={`project:${p.id}`}>
                                    {p.name} (
                                    {p.webHost || `${p.framework}.dev.test`})
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
            </div>

            {/* Middle: Dynamic Scenarios for Active Workload */}
            <div className="flex items-center gap-1 rounded-xl bg-badge p-1">
                {scenarios.map((sc) => {
                    const isSelected = currentScenarioKey === sc.id;
                    const label = SCENARIO_LABELS[sc.id] ?? sc.name;

                    return (
                        <button
                            key={sc.id}
                            type="button"
                            onClick={() =>
                                onSelectScenario(sc.id as ScenarioKind)
                            }
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                                isSelected
                                    ? sc.tone === 'bad'
                                        ? 'bg-rose-500/15 font-semibold text-rose-600 shadow-2xs dark:text-rose-400'
                                        : sc.tone === 'warn'
                                          ? 'bg-amber-500/15 font-semibold text-amber-600 shadow-2xs dark:text-amber-400'
                                          : 'bg-surface font-semibold text-ink shadow-2xs'
                                    : 'text-soft hover:text-ink',
                            )}
                            title={sc.description}
                        >
                            {getScenarioIcon(sc)}
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Right: Step Scrubbing & Playback */}
            <div className="flex items-center gap-2">
                {/* Step controls */}
                <div className="flex items-center rounded-xl border border-line bg-paper/60 p-0.5">
                    <button
                        type="button"
                        onClick={onPrev}
                        disabled={currentStepIndex <= 0}
                        className="rounded-lg p-1 text-soft transition hover:text-ink disabled:opacity-30"
                        title="Step Backward"
                    >
                        <ChevronLeft className="size-3.5" />
                    </button>
                    <span className="px-1.5 font-mono text-[11px] font-semibold text-ink">
                        {currentStepIndex + 1}/{totalSteps}
                    </span>
                    <button
                        type="button"
                        onClick={onNext}
                        disabled={currentStepIndex >= totalSteps - 1}
                        className="rounded-lg p-1 text-soft transition hover:text-ink disabled:opacity-30"
                        title="Step Forward"
                    >
                        <ChevronRight className="size-3.5" />
                    </button>
                </div>

                <Button
                    variant={isPlaying ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={onTogglePlay}
                    title={
                        isPlaying
                            ? 'Pause automatic trace'
                            : 'Start automatic trace'
                    }
                >
                    {isPlaying ? (
                        <>
                            <Pause className="size-3.5" />
                            <span>Pause</span>
                        </>
                    ) : (
                        <>
                            <Play className="size-3.5" />
                            <span>Auto Play</span>
                        </>
                    )}
                </Button>

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onReset}
                    title="Reset to beginning"
                >
                    <RotateCcw className="size-3.5" />
                    <span>Reset</span>
                </Button>

                <div className="flex items-center rounded-lg border border-line bg-paper px-1 py-0.5 text-xs">
                    {[0.5, 1, 2].map((spd) => (
                        <button
                            key={spd}
                            type="button"
                            onClick={() => onChangeSpeed(spd)}
                            className={cn(
                                'rounded px-1.5 py-0.5 font-mono text-[10px] font-medium transition',
                                speed === spd
                                    ? 'bg-surface font-semibold text-ink shadow-2xs'
                                    : 'text-soft hover:text-ink',
                            )}
                        >
                            {spd}x
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
