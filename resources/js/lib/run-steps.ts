/**
 * The install steps a run's log announces. The LaraKube CLI prints each one as a `▸ <step>` line
 * (laraKubeStep()); everything else in the log is ignored. In order, without repeats.
 */
export function parseRunSteps(output: string): string[] {
    const steps: string[] = [];

    for (const raw of output.split(/\r?\n/)) {
        // eslint-disable-next-line no-control-regex
        const line = raw.replace(/\u001b\[[0-9;]*m/g, '');
        const match = /^\s*▸\s+(.+?)\s*$/.exec(line);

        if (match && steps[steps.length - 1] !== match[1]) {
            steps.push(match[1]);
        }
    }

    return steps;
}

/** The step a running install is on, if its log has announced any. */
export function currentRunStep(output: string): string | null {
    const steps = parseRunSteps(output);

    return steps.length > 0 ? steps[steps.length - 1] : null;
}

/** "4m 12s" since `startedAt`, for an install's elapsed time. */
export function elapsedSince(
    startedAt: string | null,
    now: number,
): string | null {
    if (!startedAt) {
        return null;
    }

    const seconds = Math.max(
        0,
        Math.floor((now - new Date(startedAt).getTime()) / 1000),
    );
    const minutes = Math.floor(seconds / 60);

    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
