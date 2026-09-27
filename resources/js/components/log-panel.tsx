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

export default function LogPanel({
    output,
    placeholder,
    className,
    follow = true,
}: {
    output: string;
    placeholder: string;
    className?: string;
    follow?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const lines = output.replace(/\s+$/, '').split('\n');

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
