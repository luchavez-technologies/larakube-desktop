import { Check, Copy, Download, ExternalLink, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openExternalUrl } from '@/lib/open-external';

interface QrCodePopoverProps {
    url: string;
    title?: string;
    description?: string;
    triggerClassName?: string;
    iconClassName?: string;
    align?: 'left' | 'right' | 'center';
}

export default function QrCodePopover({
    url,
    title,
    description = 'Scan with your phone camera to open instantly',
    triggerClassName,
    iconClassName = 'size-3.5',
}: QrCodePopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    // Close on Escape key
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard fallback
        }
    };

    const downloadPngUrl = `/api/qr?url=${encodeURIComponent(url)}&download=1`;

    return (
        <div className="relative inline-flex items-center">
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                title="Show mobile QR code"
                aria-label="Show mobile QR code"
                className={
                    triggerClassName ??
                    'inline-flex size-6 cursor-pointer items-center justify-center rounded-md bg-surface text-soft ring-1 ring-line transition hover:bg-badge hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-brand'
                }
            >
                <QrCode className={iconClassName} />
            </button>

            {isOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-150"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                        }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label={title ?? 'QR Code Scanner'}
                            onClick={(e) => e.stopPropagation()}
                            className="animate-in zoom-in-95 relative w-full max-w-xs rounded-2xl bg-surface p-5 shadow-2xl ring-1 ring-line duration-150"
                        >
                            <div className="mb-3.5 flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    {title && (
                                        <h4 className="truncate text-sm font-semibold text-ink">
                                            {title}
                                        </h4>
                                    )}
                                    <p className="mt-0.5 text-xs text-soft">
                                        {description}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    aria-label="Close dialog"
                                    className="flex size-6 cursor-pointer items-center justify-center rounded-lg text-soft transition hover:bg-badge hover:text-ink focus:outline-none"
                                >
                                    <X className="size-4" />
                                </button>
                            </div>

                            {/* QR Code Container with High-Contrast Quiet Zone */}
                            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                                <QRCodeSVG
                                    value={url}
                                    size={180}
                                    level="M"
                                    marginSize={1}
                                    className="rounded"
                                />
                            </div>

                            {/* URL preview */}
                            <div className="mt-3.5 rounded-lg bg-paper px-3 py-2 font-mono text-xs text-soft ring-1 ring-line/50">
                                <div className="truncate" title={url}>
                                    {url}
                                </div>
                            </div>

                            {/* Action buttons with icons */}
                            <div className="mt-3.5 flex items-center gap-2 pt-0.5">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-ink ring-1 ring-line transition hover:bg-badge"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="size-3.5 text-emerald-500" />
                                            <span>Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="size-3.5 text-soft" />
                                            <span>Copy URL</span>
                                        </>
                                    )}
                                </button>

                                <a
                                    href={downloadPngUrl}
                                    download
                                    title="Download high-resolution PNG"
                                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg bg-surface text-soft ring-1 ring-line transition hover:bg-badge hover:text-ink"
                                >
                                    <Download className="size-3.5" />
                                </a>

                                <button
                                    type="button"
                                    onClick={() => openExternalUrl(url)}
                                    title="Open in default browser"
                                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg bg-surface text-soft ring-1 ring-line transition hover:bg-badge hover:text-ink"
                                >
                                    <ExternalLink className="size-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}
