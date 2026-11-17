import { router } from '@inertiajs/react';
import { Loader2, Power } from 'lucide-react';
import { useState } from 'react';
import Button from '@/components/button';
import type { ButtonSize, ButtonVariant } from '@/components/button';
import { wake } from '@/routes/local-cluster';

/**
 * Wakes LaraKube Linux after WSL has idled it out, and keeps it awake while
 * Desktop is open. Windows only: the server answers only there.
 */
export default function WakeUpButton({
    variant = 'secondary',
    size = 'xs',
}: {
    variant?: ButtonVariant;
    size?: ButtonSize;
}) {
    const [waking, setWaking] = useState(false);

    return (
        <Button
            variant={variant}
            size={size}
            disabled={waking}
            onClick={() =>
                router.post(
                    wake().url,
                    {},
                    {
                        preserveScroll: true,
                        onStart: () => setWaking(true),
                        onFinish: () => setWaking(false),
                    },
                )
            }
        >
            {waking ? (
                <Loader2 className="size-3 animate-spin" />
            ) : (
                <Power className="size-3" />
            )}
            <span>{waking ? 'Waking…' : 'Wake up'}</span>
        </Button>
    );
}
