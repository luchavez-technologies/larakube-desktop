import { FlaskConical } from 'lucide-react';
import InfoTooltip from '@/components/info-tooltip';
import StatusPill from '@/components/status-pill';

const EXPLANATION =
    'Still being validated by the LaraKube team — expect rough edges.';

/**
 * Marks a tool, framework, or feature as experimental — check its slug
 * against the relevant list in `usePage().props.untested` and only render
 * this when it's present there.
 */
export default function ExperimentalBadge({
    className,
    compact = false,
    align = 'right',
    side = 'top',
}: {
    className?: string;
    /** Icon only (no "Experimental" label) — for cramped rows like a nav item. */
    compact?: boolean;
    /** Which edge the explanation panel hangs from. See InfoTooltip. */
    align?: 'center' | 'right';
    /** Which side the explanation panel opens toward. See InfoTooltip. */
    side?: 'top' | 'bottom' | 'right' | 'left';
}) {
    if (compact) {
        return (
            <InfoTooltip
                className={className}
                align={align}
                side={side}
                trigger={
                    <FlaskConical className="size-3.5 text-warn hover:text-warn/80" />
                }
            >
                {EXPLANATION}
            </InfoTooltip>
        );
    }

    return (
        <InfoTooltip
            className={className}
            align={align}
            side={side}
            trigger={
                <StatusPill tone="warn">
                    <FlaskConical className="size-3" />
                    Experimental
                </StatusPill>
            }
        >
            {EXPLANATION}
        </InfoTooltip>
    );
}
