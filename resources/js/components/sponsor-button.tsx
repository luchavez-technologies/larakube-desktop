import { cn } from '@/lib/utils';

type SponsorButtonProps = {
    className?: string;
    title?: string;
};

export default function SponsorButton({
    className,
    title = 'Sponsor luchavez-technologies',
}: SponsorButtonProps) {
    return (
        <iframe
            src="https://github.com/sponsors/luchavez-technologies/button"
            title={title}
            height="32"
            width="114"
            className={cn(
                'h-8 w-[114px] shrink-0 overflow-hidden rounded-md border-0',
                className,
            )}
            style={{ border: 0, borderRadius: '6px' }}
        />
    );
}
