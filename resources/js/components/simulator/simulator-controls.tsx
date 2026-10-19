import {
    AlertTriangle,
    CheckCircle2,
    Flame,
    Pause,
    Play,
    RotateCcw,
    Zap,
} from 'lucide-react';
import Button from '@/components/button';
import { cn } from '@/lib/utils';
import type { ProjectPreset, ScenarioKind, SimulatorProject } from './types';

export default function SimulatorControls({
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
}: {
    currentScenarioKey: ScenarioKind;
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
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 p-3 shadow-lg backdrop-blur-md">
            {/* Left: Target App / Preset Selector */}
            <div className="flex items-center gap-2">
                <div className="flex flex-col">
                    <span className="text-[9px] font-semibold tracking-wider text-soft uppercase">
                        Target Workload
                    </span>
                    <select
                        value={selectedTargetId}
                        onChange={(e) => onSelectTarget(e.target.value)}
                        className="mt-0.5 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink transition focus:border-brand focus:outline-hidden"
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
                                    <option
                                        key={p.id}
                                        value={`project:${p.id}`}
                                    >
                                        {p.name} (
                                        {p.webHost || `${p.framework}.dev.test`}
                                        )
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>
            </div>

            {/* Middle: Scenario Chooser (Healthy vs Fault Injection) */}
            <div className="flex items-center gap-1 rounded-xl bg-badge p-1">
                <button
                    type="button"
                    onClick={() => onSelectScenario('healthy_web')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                        currentScenarioKey === 'healthy_web'
                            ? 'bg-surface font-semibold text-ink shadow-2xs'
                            : 'text-soft hover:text-ink',
                    )}
                >
                    <CheckCircle2 className="size-3 text-ok" />
                    <span>Web 200</span>
                </button>

                <button
                    type="button"
                    onClick={() => onSelectScenario('healthy_api')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                        currentScenarioKey === 'healthy_api'
                            ? 'bg-surface font-semibold text-ink shadow-2xs'
                            : 'text-soft hover:text-ink',
                    )}
                >
                    <Zap className="size-3 text-brand" />
                    <span>API JSON</span>
                </button>

                <button
                    type="button"
                    onClick={() => onSelectScenario('fault_database')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                        currentScenarioKey === 'fault_database'
                            ? 'bg-rose-500/15 font-semibold text-rose-600 shadow-2xs dark:text-rose-400'
                            : 'text-soft hover:text-rose-600',
                    )}
                >
                    <Flame className="size-3 text-rose-500" />
                    <span>DB Crash (500)</span>
                </button>

                <button
                    type="button"
                    onClick={() => onSelectScenario('fault_pod')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                        currentScenarioKey === 'fault_pod'
                            ? 'bg-amber-500/15 font-semibold text-amber-600 shadow-2xs dark:text-amber-400'
                            : 'text-soft hover:text-amber-600',
                    )}
                >
                    <AlertTriangle className="size-3 text-amber-500" />
                    <span>Pod Down (502)</span>
                </button>
            </div>

            {/* Right: Playback & Speed Controls */}
            <div className="flex items-center gap-2">
                <Button
                    variant={isPlaying ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={onTogglePlay}
                    title={
                        isPlaying
                            ? 'Pause automated traffic'
                            : 'Start ambient flow'
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
                    title="Reset to client origin"
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
