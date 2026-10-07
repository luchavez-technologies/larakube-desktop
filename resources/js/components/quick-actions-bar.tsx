import { useState } from 'react';
import { Zap, Sparkles } from 'lucide-react';
import Card from '@/components/card';
import Button from '@/components/button';
import ToolLogo from '@/components/tool-logo';
import CommonsCapabilityPills from '@/components/commons-capability-pills';
import QuickLaunchModal, {
    type QuickLaunchAppId,
} from '@/components/quick-launch-modal';
import type { Server, ToolCommonsCapabilities } from '@/types/larakube';

interface QuickActionApp {
    id: QuickLaunchAppId;
    name: string;
    tagline: string;
    description: string;
    capabilities: ToolCommonsCapabilities;
}

const FEATURED_APPS: QuickActionApp[] = [
    {
        id: 'pocketbase',
        name: 'PocketBase',
        tagline: 'Embedded Backend & Auth',
        description:
            'Instant REST & Realtime backend with embedded SQLite, auth, and S3 file storage.',
        capabilities: {
            databases: ['sqlite'],
            cache: [],
            storage: ['s3'],
            auth: [],
            mail: [],
        },
    },
    {
        id: 'n8n',
        name: 'n8n Automation',
        tagline: 'Workflow Automation',
        description:
            'Connect 400+ nodes and APIs. Zero-RAM SQLite or high-scale Plex PostgreSQL.',
        capabilities: {
            databases: ['sqlite', 'postgresql'],
            cache: ['redis'],
            storage: ['s3'],
            auth: [],
            mail: [],
        },
    },
    {
        id: 'wordpress',
        name: 'WordPress',
        tagline: "World's #1 CMS",
        description:
            'Blazing fast ServerSideUp FrankenPHP pod with zero-RAM SQLite or Plex MySQL.',
        capabilities: {
            databases: ['sqlite', 'mysql', 'mariadb'],
            cache: [],
            storage: ['s3'],
            auth: [],
            mail: ['smtp'],
        },
    },
];

type Props = {
    servers: Server[];
    activeCommonsServices?: string[];
    className?: string;
};

export default function QuickActionsBar({
    servers,
    activeCommonsServices = [],
    className,
}: Props) {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedApp, setSelectedApp] =
        useState<QuickLaunchAppId>('pocketbase');

    const handleLaunch = (appId: QuickLaunchAppId) => {
        setSelectedApp(appId);
        setModalOpen(true);
    };

    return (
        <section className={`space-y-3 ${className ?? ''}`}>
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Sparkles className="size-4 text-ok dark:text-emerald-400" />
                        <span>1-Click Companion Apps</span>
                    </h2>
                    <p className="mt-0.5 text-xs text-soft">
                        Instant production companion deployment with shared
                        Commons.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {FEATURED_APPS.map((app) => (
                    <Card
                        key={app.id}
                        className="flex flex-col justify-between p-3.5 transition-all duration-150 hover:shadow-md hover:ring-line/80"
                    >
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-3">
                                <ToolLogo
                                    tool={{
                                        tool: app.id,
                                        icon: '*',
                                        label: app.name,
                                        brand: app.name,
                                        installed: false,
                                        instance: '',
                                        namespace: '',
                                        host: null,
                                        url: null,
                                        installedAt: null,
                                        sso: '—',
                                        mail: 'N/A',
                                        vpn: 'N/A',
                                        sync: 'N/A',
                                        rotation: 'N/A',
                                    }}
                                    size="md"
                                />
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold text-ink">
                                        {app.name}
                                    </h3>
                                    <p className="truncate text-[11px] text-faint">
                                        {app.tagline}
                                    </p>
                                </div>
                            </div>

                            <p className="line-clamp-2 min-h-[32px] text-xs text-soft">
                                {app.description}
                            </p>

                            <CommonsCapabilityPills
                                capabilities={app.capabilities}
                                activeCommonsServices={activeCommonsServices}
                                compact
                            />
                        </div>

                        <div className="mt-4 border-t border-line/60 pt-3">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="w-full justify-center"
                                onClick={() => handleLaunch(app.id)}
                            >
                                <Zap className="size-3.5" />
                                <span>Quick Launch</span>
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            <QuickLaunchModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                initialApp={selectedApp}
                servers={servers}
                activeCommonsServices={activeCommonsServices}
            />
        </section>
    );
}
