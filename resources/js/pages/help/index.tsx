import PageHeader from '@/components/page-header';
import HelpCommunityCard from '@/components/help-community-card';
import HelpVideosCard from '@/components/help-videos-card';
import AppLayout from '@/layouts/app-layout';

export default function Help() {
    return (
        <AppLayout title="Help">
            <PageHeader
                title="Help & Community"
                subtitle="Reach out, follow along, watch how-to videos, or see how LaraKube is built."
            />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <HelpVideosCard />
                </div>
                <div>
                    <HelpCommunityCard />
                </div>
            </div>
        </AppLayout>
    );
}
