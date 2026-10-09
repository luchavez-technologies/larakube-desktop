import PageHeader from '@/components/page-header';
import HelpCommunityCard from '@/components/help-community-card';
import AppLayout from '@/layouts/app-layout';

export default function Help() {
    return (
        <AppLayout title="Help">
            <PageHeader
                title="Help & Community"
                subtitle="Reach out, follow along, or see how LaraKube is built."
            />
            <div className="max-w-xl">
                <HelpCommunityCard />
            </div>
        </AppLayout>
    );
}
