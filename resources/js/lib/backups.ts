export const SCHEDULES = [
    { value: 'nightly', label: 'Every night', cron: '0 3 * * *' },
    { value: 'twice-daily', label: 'Twice a day', cron: '0 3,15 * * *' },
    { value: 'weekly', label: 'Every Sunday', cron: '0 3 * * 0' },
] as const;

export function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** A schedule in words: the presets by name, anything else as the cron it is. */
export function describeSchedule(
    cron: string | null,
    timezone: string | null,
): string {
    if (cron === null) {
        return 'Not scheduled';
    }

    const preset = SCHEDULES.find((schedule) => schedule.cron === cron);
    const at = timezone ? ` (${timezone})` : '';

    if (preset) {
        const time = cron.startsWith('0 3,15') ? '03:00 and 15:00' : '03:00';

        return `${preset.label} at ${time}${at}`;
    }

    return `${cron}${at}`;
}

/** How long ago a CLI timestamp ("2026-10-02 03:09:00" or ISO) was. */
export function ago(timestamp: string | null): string {
    if (!timestamp) {
        return 'never';
    }

    const then = new Date(
        timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`,
    );
    const seconds = Math.max(
        0,
        Math.round((Date.now() - then.getTime()) / 1000),
    );

    if (Number.isNaN(seconds)) {
        return timestamp;
    }

    if (seconds < 3600) {
        return `${Math.max(1, Math.round(seconds / 60))} min ago`;
    }

    if (seconds < 86400) {
        return `${Math.round(seconds / 3600)} h ago`;
    }

    return `${Math.round(seconds / 86400)} days ago`;
}
