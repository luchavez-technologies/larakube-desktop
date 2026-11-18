import { type ReactNode, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import Button from '@/components/button';
import { cn } from '@/lib/utils';

export type ConfirmModalTone = 'brand' | 'warn' | 'danger';

export type ConfirmModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: ReactNode;
    notice?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: ConfirmModalTone;
    icon?: ReactNode;
    confirmIcon?: ReactNode;
    processing?: boolean;
};

const toneStyles: Record<
    ConfirmModalTone,
    { badge: string; defaultIcon: ReactNode }
> = {
    brand: {
        badge: 'bg-brand/10 text-brand ring-1 ring-brand/20',
        defaultIcon: <Info className="size-5" />,
    },
    warn: {
        badge: 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20',
        defaultIcon: <AlertTriangle className="size-5" />,
    },
    danger: {
        badge: 'bg-accent-tint text-accent ring-1 ring-accent-line',
        defaultIcon: <AlertTriangle className="size-5" />,
    },
};

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    notice,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'brand',
    icon,
    confirmIcon,
    processing = false,
}: ConfirmModalProps) {
    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !processing) {
                onClose();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose, processing]);

    if (!isOpen) {
        return null;
    }

    const styles = toneStyles[tone];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={(e) => {
                if (e.target === e.currentTarget && !processing) {
                    onClose();
                }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
        >
            <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                <div className="flex items-start gap-3.5">
                    <div
                        className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-xl',
                            styles.badge,
                        )}
                    >
                        {icon ?? styles.defaultIcon}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3
                            id="confirm-modal-title"
                            className="text-base font-semibold text-ink"
                        >
                            {title}
                        </h3>
                        <div className="mt-1.5 text-xs leading-relaxed text-soft">
                            {description}
                        </div>
                        {notice && (
                            <div className="mt-3 rounded-lg border border-warn/30 bg-warn-tint/60 p-2.5 text-xs leading-relaxed font-medium text-ink">
                                {notice}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={processing}
                        onClick={onClose}
                    >
                        <XCircle className="size-3.5" />
                        <span>{cancelLabel}</span>
                    </Button>
                    <Button
                        type="button"
                        variant={tone === 'danger' ? 'dangerFill' : 'primary'}
                        size="sm"
                        disabled={processing}
                        onClick={onConfirm}
                    >
                        {confirmIcon ?? <CheckCircle2 className="size-3.5" />}
                        <span>{confirmLabel}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
