import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

function toneFor(line: string): string {
    if (/^(Error|ERROR)|failed|✗/.test(line)) return 'text-term-bad';
    if (/✅|✓|complete!|Creation complete|ready\.|installed\./i.test(line))
        return 'text-term-ok';
    if (/^Stopping|^Interrupted/.test(line)) return 'text-term-bright';
    if (/^\s|^(Get|Hit|Setting up|Unpacking|Selecting|Preparing):?/.test(line))
        return 'text-term-dim';
    return 'text-term-text';
}

/** The CLI's ASCII-art banner, tagline and platform line, printed whenever it isn't in --json mode. */
function isBanner(line: string): boolean {
    return (
        /[█╗╔╝║╚═]{3,}/.test(line) ||
        /THE PROFESSIONAL KUBERNETES ORCHESTRATOR/.test(line) ||
        /^\s*\S+ \/ \S+ • PHP \d/.test(line)
    );
}

export default function LogPanel({
    output,
    placeholder,
    className,
    follow = true,
    fill = false,
}: {
    output: string;
    placeholder: string;
    className?: string;
    follow?: boolean;
    /** Grow to the bottom of the window instead of a fixed height. */
    fill?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    // Spinners and section breaks leave runs of blank lines; keep one.
    const lines = output
        .replace(/\s+$/, '')
        .split('\n')
        .filter((line) => !isBanner(line))
        .filter(
            (line, index, all) =>
                line.trim() !== '' ||
                (index > 0 && all[index - 1].trim() !== ''),
        );

    useEffect(() => {
        const panel = ref.current;

        if (!fill || !panel) return;

        // Cards above the panel come and go as a run finishes, so re-measure.
        const size = () => {
            const top = panel.getBoundingClientRect().top + window.scrollY;
            panel.style.height = `${Math.max(256, window.innerHeight - top - 32)}px`;
        };

        size();
        window.addEventListener('resize', size);

        return () => window.removeEventListener('resize', size);
    }, [fill, output]);

    useEffect(() => {
        if (follow) ref.current?.scrollTo({ top: ref.current.scrollHeight });
    }, [output, follow]);

    return (
        <div
            ref={ref}
            className={cn(
                'overflow-auto rounded-xl bg-term p-4.5 font-mono text-xs leading-[18px]',
                className,
            )}
        >
            {output.trim() === '' ? (
                <span className="text-term-dim">{placeholder}</span>
            ) : (
                lines.map((line, index) => (
                    <div
                        key={index}
                        className={cn(
                            'break-words whitespace-pre-wrap',
                            toneFor(line),
                        )}
                    >
                        {line || ' '}
                    </div>
                ))
            )}
        </div>
    );
}
