import { useState } from 'react';
import { ExternalLink, Heart, Layers, ShieldCheck, Zap } from 'lucide-react';
import Card from '@/components/card';
import { ExternalLinkButton } from '@/lib/open-external';
import { cn } from '@/lib/utils';

type SponsorCardProps = {
    className?: string;
};

const TIERS = [
    {
        label: '$5',
        cadence: '/mo',
        tier: 'Supporter',
        description: 'Fuel ongoing fixes & maintenance',
        url: 'https://github.com/sponsors/luchavez-technologies?frequency=recurring',
    },
    {
        label: '$15',
        cadence: '/mo',
        tier: 'Individual Dev',
        description: 'Fund new drivers & local tools',
        url: 'https://github.com/sponsors/luchavez-technologies?frequency=recurring',
        featured: true,
    },
    {
        label: '$50',
        cadence: '/mo',
        tier: 'Studio & Team',
        description: 'Priority issue review & fleet features',
        url: 'https://github.com/sponsors/luchavez-technologies?frequency=recurring',
    },
    {
        label: 'Custom',
        cadence: '',
        tier: 'One-Time / Custom',
        description: 'Choose your own contribution',
        url: 'https://github.com/sponsors/luchavez-technologies',
    },
];

const IMPACT_POINTS = [
    {
        icon: Zap,
        title: 'Multi-Cloud Drivers',
        detail: 'Hetzner, GCP, AWS EKS & bare-metal VPS providers.',
    },
    {
        icon: ShieldCheck,
        title: 'Zero-Trust Security',
        detail: 'Automated OpenBao secrets & VPN-isolated clusters.',
    },
    {
        icon: Layers,
        title: 'Companion Services',
        detail: 'Plex Commons, devboxes, mail routing, and automations.',
    },
];

export default function SponsorCard({ className }: SponsorCardProps) {
    const [avatarError, setAvatarError] = useState(false);

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
            <div className="space-y-5">
                {/* Header Banner */}
                <div className="flex flex-col gap-4 rounded-xl border border-line/80 bg-paper/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3.5">
                        <img
                            src={
                                avatarError
                                    ? '/logo.png'
                                    : 'https://avatars.githubusercontent.com/u/98193398?s=96&v=4'
                            }
                            alt="LuchTech"
                            onError={() => setAvatarError(true)}
                            className="size-12 shrink-0 rounded-xl object-cover shadow-xs ring-1 ring-line/80"
                        />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-semibold text-ink">
                                    LuchTech Web Development Services
                                </h3>
                                <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-medium text-pink-500">
                                    <Heart className="size-2.5 fill-pink-500 text-pink-500" />
                                    <span>Verified Sponsor</span>
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs text-soft">
                                Independent open-source creators of LaraKube
                                Desktop & CLI
                            </p>
                        </div>
                    </div>

                    <ExternalLinkButton
                        url="https://github.com/sponsors/luchavez-technologies"
                        className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-pink-500 active:scale-[0.98]"
                    >
                        <Heart className="size-3.5 fill-white text-white" />
                        <span>Sponsor on GitHub</span>
                        <ExternalLink className="size-3 opacity-80" />
                    </ExternalLinkButton>
                </div>

                {/* Mission statement */}
                <p className="text-xs leading-relaxed text-soft">
                    LaraKube is 100% free and open-source software built to give
                    Laravel developers effortless, production-ready Kubernetes
                    infrastructure. Your sponsorship directly funds ongoing
                    engineering, automated test matrices, and cloud driver
                    integrations.
                </p>

                {/* Tier Selection Grid */}
                <div>
                    <p className="mb-2.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                        Select a sponsorship tier
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {TIERS.map((tier) => (
                            <ExternalLinkButton
                                key={tier.tier}
                                url={tier.url}
                                className={cn(
                                    'group flex cursor-pointer flex-col justify-between rounded-xl border p-3 text-left transition-all',
                                    tier.featured
                                        ? 'border-pink-500/40 bg-pink-500/[0.04] hover:border-pink-500 hover:bg-pink-500/[0.08]'
                                        : 'hover:border-line-hover border-line bg-paper/50 hover:bg-paper',
                                )}
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-baseline gap-0.5">
                                            <span className="text-base font-bold text-ink">
                                                {tier.label}
                                            </span>
                                            {tier.cadence && (
                                                <span className="text-[11px] font-normal text-soft">
                                                    {tier.cadence}
                                                </span>
                                            )}
                                        </div>
                                        <Heart
                                            className={cn(
                                                'size-3.5 transition-transform group-hover:scale-110',
                                                tier.featured
                                                    ? 'fill-pink-500 text-pink-500'
                                                    : 'text-faint group-hover:text-pink-500',
                                            )}
                                        />
                                    </div>
                                    <span className="mt-1 block text-xs font-semibold text-ink">
                                        {tier.tier}
                                    </span>
                                </div>
                                <span className="mt-2 block text-[10px] leading-tight text-soft">
                                    {tier.description}
                                </span>
                            </ExternalLinkButton>
                        ))}
                    </div>
                </div>

                {/* Value / Impact Highlights */}
                <div className="grid grid-cols-1 gap-3 border-t border-line/60 pt-4 sm:grid-cols-3">
                    {IMPACT_POINTS.map((point) => {
                        const Icon = point.icon;
                        return (
                            <div
                                key={point.title}
                                className="flex items-start gap-2.5"
                            >
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-badge text-soft">
                                    <Icon className="size-3.5" />
                                </div>
                                <div className="min-w-0">
                                    <span className="block text-xs font-medium text-ink">
                                        {point.title}
                                    </span>
                                    <span className="block text-[11px] leading-tight text-soft">
                                        {point.detail}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
