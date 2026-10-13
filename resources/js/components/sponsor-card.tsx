import { Heart } from 'lucide-react';
import Card from '@/components/card';
import { ExternalLinkButton } from '@/lib/open-external';
import { cn } from '@/lib/utils';

type SponsorCardProps = {
    className?: string;
};

export default function SponsorCard({ className }: SponsorCardProps) {
    return (
        <Card
            label="Support LaraKube Development"
            className={className}
            action={
                <ExternalLinkButton
                    url="https://github.com/sponsors/luchavez-technologies"
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface"
                >
                    <Heart className="size-3.5 fill-[#ea4aaa]/20 text-[#ea4aaa]" />
                    <span>GitHub Sponsors</span>
                </ExternalLinkButton>
            }
        >
            <div className="space-y-4">
                <p className="text-xs leading-relaxed text-soft">
                    LaraKube is open source software proudly built and
                    maintained by{' '}
                    <span className="font-semibold text-ink">LuchTech</span>. If
                    LaraKube saves you time or streamlines your Kubernetes
                    deployments, consider sponsoring development to fund new
                    cloud drivers, security audits, and companion services.
                </p>
                <div className="flex justify-center overflow-x-auto rounded-xl border border-line/70 bg-paper/50 p-4">
                    <iframe
                        src="https://github.com/sponsors/luchavez-technologies/card"
                        title="Sponsor luchavez-technologies"
                        height="225"
                        width="600"
                        className={cn('max-w-full shrink-0 border-0')}
                        style={{ border: 0 }}
                    />
                </div>
            </div>
        </Card>
    );
}
