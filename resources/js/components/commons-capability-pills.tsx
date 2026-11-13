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
    /**
     * This specific installed instance's live wiring state (`tool.sso`,
     * `tool.mail`), so OIDC/SMTP pills on installed cards only show green when
     * this instance is actually wired to Zitadel/Stalwart rather than merely
     * sharing a server with them.
     */
    instanceWiring?: {
        sso?: string;
        mail?: string;
    };
    className?: string;
    compact?: boolean;
};

export default function CommonsCapabilityPills({
    capabilities,
    activeCommonsServices = [],
    instanceCommons,
    instanceWiring,
    className,
    compact = false,
}: Props) {
    if (!capabilities) {
        return null;
    }

    const activeSet = new Set(
        (activeCommonsServices ?? []).map((s) => s.toLowerCase()),
    );
    const isInstalledView =
        instanceCommons !== undefined || instanceWiring !== undefined;
    const hasInstanceDb = (instanceCommons?.databases.length ?? 0) > 0;
    const clusterHasMysql = activeSet.has('mysql') || activeSet.has('mariadb');
    const clusterHasPg =
        activeSet.has('postgresql') || activeSet.has('postgres');

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
            activeLabel: 'SQLite Active',
            isActive: instanceCommons ? !hasInstanceDb : false,
            icon: Database,
        });
    }
    if (dbs.includes('mysql') || dbs.includes('mariadb')) {
        const isMysqlActive = instanceCommons
            ? hasInstanceDb && (clusterHasMysql || !clusterHasPg)
            : clusterHasMysql;
        pills.push({
            key: 'mysql',
            label: 'MySQL',
            activeLabel: 'MySQL Active',
            isActive: isMysqlActive,
            icon: Database,
        });
    }
    if (dbs.includes('postgresql') || dbs.includes('postgres')) {
        const isPgActive = instanceCommons
            ? hasInstanceDb && (clusterHasPg || !clusterHasMysql)
            : clusterHasPg;
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
        const isOidcActive = isInstalledView
            ? instanceWiring?.sso === 'wired'
            : activeSet.has('oidc') ||
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
        const isMailActive = isInstalledView
            ? instanceWiring?.mail === 'wired'
            : activeSet.has('smtp') || activeSet.has('mail');
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
                const title = isInstalledView
                    ? pill.isActive
                        ? `Wired & active on this app: ${pill.activeLabel}`
                        : `Supported (${pill.label}) — not wired to this instance`
                    : pill.isActive
                      ? `Active on current server: ${pill.activeLabel}`
                      : `Compatible with ${pill.label}`;

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
                        title={title}
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
