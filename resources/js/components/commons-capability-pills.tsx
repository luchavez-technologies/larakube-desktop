import { Check, Database, Zap, HardDrive, KeyRound, Mail } from 'lucide-react';
import type { ToolCommonsCapabilities } from '@/types/larakube';
import { cn } from '@/lib/utils';

type Props = {
    capabilities?: ToolCommonsCapabilities;
    activeCommonsServices?: string[];
    className?: string;
    compact?: boolean;
};

export default function CommonsCapabilityPills({
    capabilities,
    activeCommonsServices = [],
    className,
    compact = false,
}: Props) {
    if (!capabilities) {
        return null;
    }

    const activeSet = new Set(
        (activeCommonsServices ?? []).map((s) => s.toLowerCase()),
    );

    const pills: Array<{
        key: string;
        label: string;
        activeLabel: string;
        isActive: boolean;
        icon: typeof Database;
    }> = [];

    // Databases
    const dbs = capabilities.databases ?? [];
    if (dbs.includes('sqlite')) {
        pills.push({
            key: 'sqlite',
            label: 'SQLite',
            activeLabel: 'SQLite',
            isActive: false, // SQLite is embedded/local
            icon: Database,
        });
    }
    if (dbs.includes('mysql') || dbs.includes('mariadb')) {
        const isMysqlActive =
            activeSet.has('mysql') || activeSet.has('mariadb');
        pills.push({
            key: 'mysql',
            label: 'MySQL',
            activeLabel: 'MySQL Active',
            isActive: isMysqlActive,
            icon: Database,
        });
    }
    if (dbs.includes('postgresql') || dbs.includes('postgres')) {
        const isPgActive =
            activeSet.has('postgresql') || activeSet.has('postgres');
        pills.push({
            key: 'postgresql',
            label: 'Postgres',
            activeLabel: 'Postgres Active',
            isActive: isPgActive,
            icon: Database,
        });
    }

    // Cache / Queue
    const cache = capabilities.cache ?? [];
    if (cache.includes('redis')) {
        const isRedisActive = activeSet.has('redis');
        pills.push({
            key: 'redis',
            label: 'Redis',
            activeLabel: 'Redis Active',
            isActive: isRedisActive,
            icon: Zap,
        });
    }

    // Storage
    const storage = capabilities.storage ?? [];
    if (
        storage.includes('s3') ||
        storage.includes('minio') ||
        storage.includes('garage')
    ) {
        const isStorageActive =
            activeSet.has('s3') ||
            activeSet.has('minio') ||
            activeSet.has('garage');
        pills.push({
            key: 's3',
            label: 'S3 Storage',
            activeLabel: 'S3 Active',
            isActive: isStorageActive,
            icon: HardDrive,
        });
    }

    // Auth
    const auth = capabilities.auth ?? [];
    if (auth.includes('oidc')) {
        const isOidcActive =
            activeSet.has('oidc') ||
            activeSet.has('sso') ||
            activeSet.has('zitadel');
        pills.push({
            key: 'oidc',
            label: 'OIDC SSO',
            activeLabel: 'Zitadel SSO',
            isActive: isOidcActive,
            icon: KeyRound,
        });
    }

    // Mail
    const mail = capabilities.mail ?? [];
    if (mail.includes('smtp')) {
        const isMailActive = activeSet.has('smtp') || activeSet.has('mail');
        pills.push({
            key: 'smtp',
            label: 'SMTP Relay',
            activeLabel: 'Stalwart Mail',
            isActive: isMailActive,
            icon: Mail,
        });
    }

    if (pills.length === 0) {
        return null;
    }

    return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
            {pills.map((pill) => {
                const Icon = pill.icon;
                return (
                    <span
                        key={pill.key}
                        className={cn(
                            'inline-flex items-center gap-1 rounded-md font-medium transition-colors',
                            compact
                                ? 'px-1.5 py-0.5 text-[10px]'
                                : 'px-2 py-0.5 text-xs',
                            pill.isActive
                                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                                : 'bg-badge/70 text-soft',
                        )}
                        title={
                            pill.isActive
                                ? `Active on current server: ${pill.activeLabel}`
                                : `Compatible with ${pill.label}`
                        }
                    >
                        {pill.isActive ? (
                            <Check className="size-3 text-emerald-400" />
                        ) : (
                            <Icon className="text-muted-foreground size-3" />
                        )}
                        <span>
                            {pill.isActive ? pill.activeLabel : pill.label}
                        </span>
                    </span>
                );
            })}
        </div>
    );
}
