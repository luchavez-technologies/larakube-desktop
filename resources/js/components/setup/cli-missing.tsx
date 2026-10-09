import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Download, RefreshCw } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';

export default function CliMissing({
    windows,
    diagnostic,
    command,
    channel,
    onChannelChange,
}: {
    windows: boolean;
    diagnostic: string | null;
    command: string;
    channel: string;
    onChannelChange: (channel: string) => void;
}) {
    const [installing, setInstalling] = useState(false);

    const handleInstall = () => {
        setInstalling(true);
        router.post(
            '/setup/tools/larakube/install',
            { channel },
            {
                onFinish: () => setInstalling(false),
            },
        );
    };

    if (windows) {
        return (
            <Card tone="error" className="p-6.5">
                <h2 className="text-lg font-semibold tracking-[-0.015em]">
                    The LaraKube CLI did not answer
                </h2>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                    It comes with LaraKube Linux, so it should already be there.
                    Press Check again; if this stays, send the details below.
                </p>
                {diagnostic && (
                    <pre className="mt-3 max-w-full overflow-x-auto rounded-lg bg-term px-3 py-2 font-mono text-xs whitespace-pre-wrap text-term-bright">
                        {diagnostic}
                    </pre>
                )}
            </Card>
        );
    }

    return (
        <Card tone="error" className="p-6.5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-[-0.015em]">
                        Install the LaraKube CLI
                    </h2>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-soft">
                        LaraKube Desktop runs everything through the LaraKube
                        CLI. Install it in one click without touching the
                        terminal, or run the command below.
                    </p>
                </div>

                {/* Release Channel Selector */}
                <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-line">
                    <span className="text-xs font-medium text-soft">
                        Channel:
                    </span>
                    <button
                        type="button"
                        onClick={() => onChannelChange('canary')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            channel === 'canary'
                                ? 'bg-brand text-white shadow-2xs'
                                : 'hover:text-foreground text-soft'
                        }`}
                    >
                        Canary
                    </button>
                    <button
                        type="button"
                        onClick={() => onChannelChange('stable')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            channel === 'stable'
                                ? 'bg-brand text-white shadow-2xs'
                                : 'hover:text-foreground text-soft'
                        }`}
                    >
                        Stable
                    </button>
                </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
                <Button
                    type="button"
                    variant="primary"
                    onClick={handleInstall}
                    disabled={installing}
                    className="gap-2 px-5 py-2.5 text-sm"
                >
                    {installing ? (
                        <RefreshCw className="size-4 animate-spin" />
                    ) : (
                        <Download className="size-4" />
                    )}
                    <span>
                        {installing
                            ? 'Downloading and installing…'
                            : `Install LaraKube CLI (${channel === 'canary' ? 'Canary' : 'Stable'})`}
                    </span>
                </Button>
            </div>

            <div className="mt-6 border-t border-line/60 pt-4">
                <p className="mb-2 text-xs text-soft">
                    Or install manually via Terminal:
                </p>
                <div className="flex max-w-2xl items-center justify-between gap-3 rounded-[10px] bg-surface px-3 py-2.5 ring-1 ring-line">
                    <code className="truncate font-mono text-xs">
                        $ {command}
                    </code>
                    <CopyButton value={command} />
                </div>
            </div>
        </Card>
    );
}
