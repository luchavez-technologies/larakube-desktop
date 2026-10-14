import { Check, Copy, Download, ExternalLink, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
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
    align = 'right',
}: QrCodePopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

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

    const alignmentClasses = {
        left: 'left-0',
        right: 'right-0',
        center: 'left-1/2 -translate-x-1/2',
    }[align];

    return (
        <div ref={containerRef} className="relative inline-flex items-center">
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
                    'border-edge hover:border-edge-strong hover:bg-hover inline-flex size-6 cursor-pointer items-center justify-center rounded-md border text-soft transition hover:text-ink'
                }
            >
                <QrCode className={iconClassName} />
            </button>

            {isOpen && (
                <div
                    role="dialog"
                    aria-label="QR Code Scanner"
                    onClick={(e) => e.stopPropagation()}
                    className={`border-edge bg-canvas animate-in fade-in-0 zoom-in-95 absolute bottom-full z-50 mb-2 w-72 rounded-xl border p-4 shadow-2xl ${alignmentClasses}`}
                >
                    <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            {title && (
                                <h4 className="truncate text-xs font-semibold text-ink">
                                    {title}
                                </h4>
                            )}
                            <p className="text-[11px] text-soft">
                                {description}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="hover:bg-hover size-5 rounded p-0.5 text-soft transition hover:text-ink"
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>

                    {/* QR Code Container with High-Contrast Quiet Zone */}
                    <div className="flex flex-col items-center justify-center rounded-lg bg-white p-3.5 shadow-inner">
                        <QRCodeSVG
                            value={url}
                            size={160}
                            level="M"
                            marginSize={1}
                            className="rounded"
                        />
                    </div>

                    {/* URL preview */}
                    <div className="mt-3 rounded-md bg-paper px-2.5 py-1.5 font-mono text-[10px] text-soft">
                        <div className="truncate" title={url}>
                            {url}
                        </div>
                    </div>

                    {/* Action buttons with icons */}
                    <div className="mt-3 flex items-center gap-1.5 pt-1">
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="border-edge bg-canvas hover:bg-hover inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium text-ink transition"
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
                            className="border-edge bg-canvas hover:bg-hover inline-flex size-7 items-center justify-center rounded-lg border text-soft transition hover:text-ink"
                        >
                            <Download className="size-3.5" />
                        </a>

                        <button
                            type="button"
                            onClick={() => openExternalUrl(url)}
                            title="Open in default browser"
                            className="border-edge bg-canvas hover:bg-hover inline-flex size-7 items-center justify-center rounded-lg border text-soft transition hover:text-ink"
                        >
                            <ExternalLink className="size-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
