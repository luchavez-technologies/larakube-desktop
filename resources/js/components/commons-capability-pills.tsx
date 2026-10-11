import { Check, Database, Zap, HardDrive, KeyRound, Mail } from 'lucide-react';
import type { ToolCommonsCapabilities } from '@/types/larakube';
import { cn } from '@/lib/utils';

type Props = {
    capabilities?: ToolCommonsCapabilities;
    activeCommonsServices?: string[];
    /**
     * This specific instance's own Commons tenants (a `ClusterTool` row's
     * `commons` field), when known — overrides `activeCommonsServices` for
     * the database/cache/storage pills so they reflect whether THIS
     * instance actually joined the Commons, not whether the cluster runs
     * one anywhere. Omit for a not-yet-installed tool, where there is no
     * instance to be accurate about and the cluster-wide signal is the
     * right question ("would installing this join an active service?").
     */
    instanceCommons?: {
        databases: string[];
        redis: string[];
        buckets: string[];
    };
    className?: string;
    compact?: boolean;
};

export default function CommonsCapabilityPills({
    capabilities,
    activeCommonsServices = [],
    instanceCommons,
    className,
    compact = false,
}: Props) {
    if (!capabilities) {
        return null;
    }

    const activeSet = new Set(
        (activeCommonsServices ?? []).map((s) => s.toLowerCase()),
    );
    const instanceDbActive = instanceCommons
        ? instanceCommons.databases.length > 0
        : null;

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
            instanceDbActive ??
            (activeSet.has('mysql') || activeSet.has('mariadb'));
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
            instanceDbActive ??
            (activeSet.has('postgresql') || activeSet.has('postgres'));
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
        const isRedisActive = instanceCommons
            ? instanceCommons.redis.length > 0
            : activeSet.has('redis');
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
        const isStorageActive = instanceCommons
            ? instanceCommons.buckets.length > 0
            : activeSet.has('s3') ||
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
                                ? 'bg-ok-tint font-semibold text-ok ring-1 ring-ok/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30'
                                : 'bg-badge/70 text-soft ring-1 ring-line/50',
                        )}
                        title={
                            pill.isActive
                                ? `Active on current server: ${pill.activeLabel}`
                                : `Compatible with ${pill.label}`
                        }
                    >
                        {pill.isActive ? (
                            <Check className="size-3 text-ok dark:text-emerald-400" />
                        ) : (
                            <Icon className="size-3 text-soft" />
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
