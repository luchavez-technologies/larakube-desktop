import { Head, Link } from '@inertiajs/react';
import { Network, PlayCircle, Sparkles } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import PageHeader from '@/components/page-header';
import HelpCommunityCard from '@/components/help-community-card';
import HelpVideosCard from '@/components/help-videos-card';
import SponsorCard from '@/components/sponsor-card';

export default function Help() {
    return (
        <>
            <Head title="Help" />
            <PageHeader
                title="Help & Community"
                subtitle="Reach out, follow along, watch how-to videos, or see how LaraKube is built."
            />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                    <Card
                        label="Interactive Architecture"
                        action={
                            <Link
                                href="/simulator"
                                className={buttonClass('primary', 'sm')}
                            >
                                <PlayCircle className="size-3.5" />
                                <span>Launch Simulator</span>
                            </Link>
                        }
                    >
                        <div className="flex items-start gap-3.5">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-xs">
                                <Network className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-semibold text-ink">
                                        Life of a Request Simulator
                                    </h3>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-semibold text-ok">
                                        <Sparkles className="size-3" />
                                        Interactive
                                    </span>
                                </div>
                                <p className="text-xs leading-relaxed text-soft">
                                    Step through how an incoming HTTP request
                                    travels from a browser through DNS,
                                    Cloudflare, Traefik Ingress, FrankenPHP /
                                    Octane pods, Redis cache, and database
                                    replicas inside a LaraKube cluster.
                                </p>
                            </div>
                        </div>
                    </Card>
                    <HelpVideosCard />
                    <SponsorCard />
                </div>
                <div>
                    <HelpCommunityCard />
                </div>
            </div>
        </>
    );
}
