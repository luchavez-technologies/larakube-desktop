import type { ReactNode } from 'react';
import { HardDrive, MemoryStick, Search } from 'lucide-react';
import {
    SiMeilisearch,
    SiPocketbase,
    SiMatrix,
    SiOpenbao,
    SiTwenty,
    SiLivekit,
    SiUptimekuma,
    SiForgejo,
    SiGitea,
    SiGrafana,
    SiPrometheus,
    SiMinio,
    SiN8n,
    SiMetabase,
    SiRedis,
    SiMongodb,
    SiPostgresql,
    SiMysql,
    SiMariadb,
    SiAdminer,
    SiPhpmyadmin,
    SiWireguard,
    SiOwncloud,
    SiUmami,
    SiPlausibleanalytics,
    SiTraefikproxy,
    SiOutline,
    SiChatwoot,
    SiDirectus,
    SiVaultwarden,
    SiPenpot,
    SiReactiveresume,
    SiWordpress,
    SiGooglechrome,
} from '@icons-pack/react-simple-icons';
import type { ClusterTool } from '@/types/larakube';

type Props = {
    tool?: ClusterTool | { tool?: string; logo?: string; icon?: string };
    slug?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
};

type BrandVisual = {
    icon: ReactNode;
    containerClass: string;
};

export default function ToolLogo({
    tool,
    slug: rawSlug,
    size = 'md',
    className = '',
}: Props) {
    // The CLI names what to draw (`logo`); a slug is only for things the CLI does not list, like companions.
    const id = (tool?.logo ?? rawSlug ?? tool?.tool ?? '').toLowerCase();

    const sizeClass = {
        sm: 'size-8 text-xs rounded-lg',
        md: 'size-10 text-sm rounded-xl',
        lg: 'size-12 text-base rounded-xl',
    }[size];

    const iconPixelSize = {
        sm: 16,
        md: 20,
        lg: 24,
    }[size];

    const iconSizeClass = {
        sm: 'size-4',
        md: 'size-5',
        lg: 'size-6',
    }[size];

    const visual = getBrandVisual(id, iconPixelSize, iconSizeClass);

    if (visual) {
        return (
            <span
                className={`flex shrink-0 items-center justify-center ${visual.containerClass} ${sizeClass} ${className}`}
            >
                {visual.icon}
            </span>
        );
    }

    return (
        <span
            className={`flex shrink-0 items-center justify-center bg-tools/10 text-tools ring-1 ring-tools/25 ${sizeClass} ${className}`}
        >
            {tool?.icon ?? '🛠️'}
        </span>
    );
}

/**
 * Just the brand mark, no badge/container — for a small inline spot (a pill,
 * a compact list row) where ToolLogo's fixed size-8+ box doesn't fit. null
 * when nothing is known for this slug, so a caller can fall back to its own
 * generic icon instead of rendering nothing.
 */
export function brandIcon(slug: string, px = 12): ReactNode | null {
    return getBrandVisual(slug.toLowerCase(), px, 'size-3')?.icon ?? null;
}

function getBrandVisual(
    id: string,
    px: number,
    sizeClass: string,
): BrandVisual | null {
    // 1. PocketBase / Data / Headless CMS
    if (id === 'pocketbase') {
        return {
            containerClass:
                'bg-sky-500/10 ring-1 ring-sky-500/25 text-[#0284C7] dark:text-[#38BDF8]',
            icon: <SiPocketbase size={px} color="#0284C7" />,
        };
    }

    // 1b. Directus
    if (id === 'directus') {
        return {
            containerClass:
                'bg-[#64748B]/10 ring-1 ring-[#64748B]/25 text-[#6644FF] dark:text-[#8866FF]',
            icon: <SiDirectus size={px} color="#6644FF" />,
        };
    }

    // 1c. WordPress
    if (id === 'wordpress') {
        return {
            containerClass:
                'bg-sky-500/10 ring-1 ring-sky-500/25 text-[#21759B] dark:text-[#38BDF8]',
            icon: <SiWordpress size={px} color="#21759B" />,
        };
    }

    // 2. Matrix / Chat
    if (id === 'matrix') {
        return {
            containerClass:
                'bg-neutral-900 dark:bg-neutral-800 ring-1 ring-neutral-700 text-white shadow-xs',
            icon: <SiMatrix size={px} color="#FFFFFF" />,
        };
    }

    // 3. OpenBao / Vault (Secrets)
    if (id === 'openbao') {
        return {
            containerClass:
                'bg-teal-500/10 ring-1 ring-teal-500/25 text-[#136C56] dark:text-[#3ABFA0]',
            icon: <SiOpenbao size={px} color="#136C56" />,
        };
    }

    // 4. Twenty CRM
    if (id === 'twenty') {
        return {
            containerClass:
                'bg-neutral-900 dark:bg-neutral-800 ring-1 ring-neutral-700 text-white shadow-xs',
            icon: <SiTwenty size={px} color="#FFFFFF" />,
        };
    }

    // 5. LiveKit / Meet (crisp on dark container)
    if (id === 'livekit') {
        return {
            containerClass:
                'bg-slate-900 dark:bg-slate-800 ring-1 ring-slate-700 text-white shadow-xs',
            icon: <SiLivekit size={px} color="#FFFFFF" />,
        };
    }

    // 6. Uptime Kuma
    if (id === 'kuma') {
        return {
            containerClass:
                'bg-emerald-500/10 ring-1 ring-emerald-500/25 text-[#16A34A] dark:text-[#4ADE80]',
            icon: <SiUptimekuma size={px} color="#16A34A" />,
        };
    }

    // 7. Vaultwarden / Bitwarden / Passwords
    if (id === 'vaultwarden') {
        return {
            containerClass:
                'bg-blue-500/10 ring-1 ring-blue-500/25 text-[#175DDC] dark:text-[#60A5FA]',
            icon: <SiVaultwarden size={px} color="#175DDC" />,
        };
    }

    // 8. Forgejo / Gitea / Git
    if (id === 'forgejo') {
        return {
            containerClass:
                'bg-orange-500/10 ring-1 ring-orange-500/25 text-[#EA580C] dark:text-[#FB923C]',
            icon: <SiForgejo size={px} color="#EA580C" />,
        };
    }
    if (id === 'gitea') {
        return {
            containerClass:
                'bg-lime-500/10 ring-1 ring-lime-500/25 text-[#4D7C0F] dark:text-[#84CC16]',
            icon: <SiGitea size={px} color="#4D7C0F" />,
        };
    }

    // 9. Grafana / Monitor
    if (id === 'grafana') {
        return {
            containerClass:
                'bg-amber-500/10 ring-1 ring-amber-500/25 text-[#D97706] dark:text-[#FBBF24]',
            icon: <SiGrafana size={px} color="#F46800" />,
        };
    }

    // 10. Prometheus
    if (id === 'prometheus') {
        return {
            containerClass:
                'bg-red-500/10 ring-1 ring-red-500/25 text-[#DC2626] dark:text-[#F87171]',
            icon: <SiPrometheus size={px} color="#E6522C" />,
        };
    }

    // 11. MinIO / Drive / Object Storage
    if (id === 'minio') {
        return {
            containerClass:
                'bg-rose-500/10 ring-1 ring-rose-500/25 text-[#C72E49] dark:text-[#FB7185]',
            icon: <SiMinio size={px} color="#C72E49" />,
        };
    }

    // 11b. Plex Commons service drivers without a Simple Icons brand mark —
    // a clean Lucide fallback with a distinct tint rather than a hand-drawn
    // approximation of a logo this component has no verified source for.
    if (id === 'seaweedfs') {
        return {
            containerClass:
                'bg-amber-500/10 ring-1 ring-amber-500/25 text-amber-600 dark:text-amber-400',
            icon: <HardDrive size={px} className={sizeClass} />,
        };
    }
    if (id === 'garage') {
        return {
            containerClass:
                'bg-orange-500/10 ring-1 ring-orange-500/25 text-orange-600 dark:text-orange-400',
            icon: <HardDrive size={px} className={sizeClass} />,
        };
    }
    if (id === 'meilisearch') {
        return {
            containerClass:
                'bg-pink-500/10 ring-1 ring-pink-500/25 text-[#FF5CAA]',
            icon: <SiMeilisearch size={px} color="#FF5CAA" />,
        };
    }
    if (id === 'typesense') {
        return {
            containerClass:
                'bg-teal-500/10 ring-1 ring-teal-500/25 text-teal-600 dark:text-teal-400',
            icon: <Search size={px} className={sizeClass} />,
        };
    }
    if (id === 'memcached') {
        return {
            containerClass:
                'bg-sky-500/10 ring-1 ring-sky-500/25 text-sky-600 dark:text-sky-400',
            icon: <MemoryStick size={px} className={sizeClass} />,
        };
    }

    // 12. ownCloud / oCIS
    if (id === 'ocis') {
        return {
            containerClass:
                'bg-[#041E42] ring-1 ring-[#041E42]/80 text-white shadow-xs',
            icon: <SiOwncloud size={px} color="#FFFFFF" />,
        };
    }

    // 13. n8n / Flow
    if (id === 'n8n') {
        return {
            containerClass:
                'bg-pink-500/10 ring-1 ring-pink-500/25 text-[#DB2777] dark:text-[#F472B6]',
            icon: <SiN8n size={px} color="#EA4B71" />,
        };
    }

    // 13b. Windmill
    if (id === 'windmill') {
        return {
            containerClass:
                'bg-blue-500/10 ring-1 ring-blue-500/25 text-[#3B82F6]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M455.1 139.5H202.7l56.9 98.5H512zM273.9 264.9l-41 71-85.3 147.7h113.8l28.4-49.2 70.5-122 27.3-47.5zm-30.5-1L202.5 193 117.2 45.3l-56.9 98.5L88.7 193l70.4 122 27.4 47.4z"
                        fill="#3B82F6"
                    />
                    <path
                        d="m269.6 28.4-41 68-25.9 43.1h113.7l39.5-65.6 27.4-45.5zm-140 235.5-79.3-1.5-50.3-.9L56.9 360l76.6 1.4 53 1zm201.2 99.6 38.4 69.4 24.3 44 56.9-98.5-37.1-67-25.6-46.5z"
                        fill="#93C5FD"
                    />
                </svg>
            ),
        };
    }

    // 14. Metabase / Insights
    if (id === 'metabase') {
        return {
            containerClass:
                'bg-sky-500/10 ring-1 ring-sky-500/25 text-[#0284C7] dark:text-[#38BDF8]',
            icon: <SiMetabase size={px} color="#509EE3" />,
        };
    }

    // 15. Outline / Notes
    if (id === 'outline') {
        return {
            containerClass:
                'bg-zinc-900 dark:bg-zinc-800 ring-1 ring-zinc-700 text-white shadow-xs',
            icon: <SiOutline size={px} color="#FFFFFF" />,
        };
    }

    // 16. Chatwoot / Support
    if (id === 'chatwoot') {
        return {
            containerClass:
                'bg-blue-500/10 ring-1 ring-blue-500/25 text-[#2563EB] dark:text-[#60A5FA]',
            icon: <SiChatwoot size={px} color="#1F93FF" />,
        };
    }

    // 17. Umami / Analytics
    if (id === 'umami') {
        return {
            containerClass:
                'bg-neutral-900 dark:bg-neutral-800 ring-1 ring-neutral-700 text-white shadow-xs',
            icon: <SiUmami size={px} color="#FFFFFF" />,
        };
    }

    // 18. Plausible Analytics
    if (id === 'plausible') {
        return {
            containerClass:
                'bg-indigo-500/10 ring-1 ring-indigo-500/25 text-[#4F46E5] dark:text-[#818CF8]',
            icon: <SiPlausibleanalytics size={px} color="#5850EC" />,
        };
    }

    // 19. GlitchTip / Sentry / Errors
    if (id === 'glitchtip') {
        return {
            containerClass:
                'bg-purple-900 ring-1 ring-purple-700 text-white shadow-xs',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M444.4 512H67.6C30.3 512 0 481.7 0 444.4V67.6C0 30.3 30.3 0 67.6 0h376.8C481.7 0 512 30.3 512 67.6v376.8c0 37.3-30.3 67.6-67.6 67.6"
                        fill="#613060"
                    />
                    <path
                        d="M341.4 444.1h69V234.4H262.2v68.4h70.1v18.9c0 36.6-32.9 56.1-73.8 56.1-50.7 0-83.5-29.1-83.5-91.6v-60.4c0-62.5 32.9-91.6 83.5-91.6 43.7 0 66.8 23.7 78.1 52.8l66.8-38.3c-28-57.7-78.1-87.3-145-87.3-101.8 0-170.3 69.6-170.3 196.2 0 126.1 67.9 192.9 154.1 192.9 56.6 0 91.1-28.6 96.5-66.3h2.7z"
                        fill="#FFFFFF"
                    />
                    <path
                        d="M410.4 308.8v-74.3H262.2v68.4h70.1v11.3zm-230.2 16.1c-3.5-11.1-5.3-24-5.3-38.7v-58.1l-85.9 6c-.5 7.6-.8 15.4-.8 23.5 0 27.1 3.1 51.5 8.9 73.1z"
                        fill="#E94056"
                    />
                </svg>
            ),
        };
    }

    // 20. NetBird / WireGuard / VPN
    if (id === 'netbird') {
        return {
            containerClass:
                'bg-orange-500/10 ring-1 ring-orange-500/25 text-[#F55422]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M512 69.9H363.9c-61.8 5.7-92.5 41.3-104.1 59.3l-5.2 9.1c-.4.8-.6 1.3-.6 1.3l-.1-.1-.8 1.3C144.5 88.1 0 126.9 0 126.9l162 171.8-82.9 143.4h218l71.6-123.8v-.2z"
                        fill="#F68330"
                    />
                    <path
                        d="m253.1 140.8-91.2 157.9 135.2 143.4 71.6-124c-11.3-96.9-58.5-149.7-115.6-177.3"
                        fill="#F35E32"
                    />
                </svg>
            ),
        };
    }
    if (id === 'wireguard') {
        return {
            containerClass:
                'bg-red-500/10 ring-1 ring-red-500/25 text-[#88171A]',
            icon: <SiWireguard size={px} color="#88171A" />,
        };
    }

    // 21. Zitadel / SSO
    if (id === 'zitadel') {
        return {
            containerClass:
                'bg-amber-500/10 ring-1 ring-amber-500/25 text-[#FF3B30]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <defs>
                        <linearGradient
                            id="zitadel-grad"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                        >
                            <stop offset="0%" stopColor="#FF8F00" />
                            <stop offset="100%" stopColor="#FE00FF" />
                        </linearGradient>
                    </defs>
                    <path
                        d="m106 268.1 10.4 39.1-49 49 66.8 18 10.4 39.1-145.1-39z"
                        fill="url(#zitadel-grad)"
                    />
                    <path
                        d="m412.3 145.1-39.2-10.4-17.8-67-49 49-39.2-10.4L373.4 0z"
                        fill="url(#zitadel-grad)"
                    />
                    <path
                        d="m366.8 473.1 28.5-28.5 66.8 18-17.8-67 28.5-28.5 38.9 145z"
                        fill="url(#zitadel-grad)"
                    />
                    <path
                        d="m247.9 490.9-8.8-88.6 60.5 16.1z"
                        fill="url(#zitadel-grad)"
                    />
                    <path
                        d="m149.3 155.5 36.7 81.1 44.1-44.2z"
                        fill="url(#zitadel-grad)"
                    />
                    <path
                        d="m489.3 246.3-88.7-8.7 16.2 60.5z"
                        fill="url(#zitadel-grad)"
                    />
                    <path
                        d="M426 393.5c-2.5-9.5-10.4-16-19.7-17.1-1.4-.3-3.3-1.1-4.7-2.8l-5.2-19.5c0-2.5.5-4.3 1.1-5.6 8.5-5.3 12.9-15.7 10.1-25.9-3.3-12.4-16.2-19.9-28.5-16.4-12.3 3.4-19.7 16.1-16.4 28.5 2.2 7.9 7.9 13.6 15.3 16.1l-.8.2s6.8.6 10.1 9.2c.8 1.9 1.4 4.8 1.9 6.7.8 3.1.8 3.4 1.6 6.5 1.4 5.1-1.6 7.4-1.6 7.4l.8-.2c-1.9 1.4-3.6 3.1-4.9 5l.3-1.4s-3 3.4-9.3 2.6l-172.6-47.3c-4.1-1.4-7.9-2.6-11.5-4.2-9-4.2-10.7-9-10.7-12.1.3-2.3 1.4-5.7 4.9-10.4 4.7-6.2 11.2-13 18.4-20.6 0 0 0-.2.3-.2l88.7-89.3c8.2-7.8 15.6-14.6 21.6-20 1.4-1.2 3-2.2 4.4-3.4 2.5-2.3 4.9-3.6 7.1-4.3h-.3s10.1-3.1 14.2 8.7c.5 1.9 1.9 9.9 2.5 15 .3 1.6-.3 3.3-1.1 4.8-7.7 5.4-11.5 15.4-9 25 3.3 12.4 16.2 19.9 28.5 16.4 12.3-3.4 19.7-16.1 16.4-28.5-1.9-7.3-7.1-12.9-13.7-15.5l.8-.3s-7.1-2-9.3-5.3c-1.6-2.6-4.9-12.4-5.5-14.3-2.5-7.4 5.2-14.6 5.2-14.6l-.8.2c4.7-5.6 6.8-13.5 4.7-21.1-3.3-12.4-16.2-19.9-28.5-16.4-11.5 3.1-18.9 14.4-17 26.1l-.8-.8s1.6 9.2-3.6 15.2c-1.1 1.2-2.2 2.8-3.6 4.3-4.4 5.3-10.1 11.3-16.2 18L194 288.5c-6.3 5.9-11.8 11.2-17.3 15.2-6.6 5-13.4 5.4-16.7 5.3-.5 0-.8 0-1.4-.2-.5 0-.8-.2-.8-.2l.3.2c-1.9 0-4.1.3-6 .8-12.3 3.4-19.7 16.1-16.4 28.5s16.2 19.9 28.5 16.4c4.4-1.2 8.2-3.6 11-6.7 2.5-.8 6.6-1.2 13.1-.2 7.7 1.2 16.7 3.3 26.8 5.7 3.6.8 7.4 1.7 11 2.6l95 26.1c3 .9 5.8 1.7 8.8 2.5 13.4 4 37.5 10.2 39.2 10.7 11 3.1 10.4 7.9 10.4 7.9l.5-1.7c0 1.2.3 2.5.5 3.7 3.3 12.4 16.2 19.9 28.5 16.4 12.9-2.8 20.3-15.6 17-28"
                        fill="currentColor"
                    />
                </svg>
            ),
        };
    }

    // 22. Stalwart / Mailpit / Mail
    if (id === 'stalwart' || id === 'mailpit') {
        return {
            containerClass:
                'bg-indigo-500/10 ring-1 ring-indigo-500/25 text-[#4F46E5]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M269 33.4h-26L0 173.8v45l243 140.5h26l243-140.5v-45zm178.5 162.7H256V86zM256 306.7 64.5 196.1 211 111.5V221l34.2 19.5h124.2zM0 278.5v59.7l243 140.4h26l243-140.4v-59.7L256 426.6zm476.2 200.1L512 458v-59.6l-139.4 80.2zM0 458l35.8 20.6h103.6L0 398.4z"
                        fill="#4F46E5"
                    />
                </svg>
            ),
        };
    }

    // 23. Teable / Sheets
    if (id === 'teable') {
        return {
            containerClass:
                'bg-emerald-500/10 ring-1 ring-emerald-500/25 text-[#10B981]',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    className={`${sizeClass} shrink-0 fill-current`}
                >
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M8.85 22.7h9.3c2.5 0 4.7-2 4.7-4.55v-9.6c0-.56-.27-1.15-.6-1.7-.35-.56-.81-1.14-1.29-1.67a26 26 0 0 0-2.49-2.41C17.53 1.99 16.37 1.3 15 1.3H6.6C5.06 1.3 3.74 2.15 2.82 3.17 1.9 4.18 1.3 5.46 1.3 6.45v8.25c0 .68.27 1.41.64 2.09.38.7.89 1.4 1.43 2.04.97 1.28 2.2 2.39 2.83 2.87.53.4 1.15.7 1.74.87.27.08.52.12.78.13h.13zm0-15.75h9.3c.27 0 .71.2 1.13.58.2.18.36.38.47.57.11.19.15.35.15.45v9.6c0 .1-.04.26-.17.47a3.2 3.2 0 0 1-.52.63 3.5 3.5 0 0 1-.64.49c-.22.13-.36.16-.42.16h-9.3c-.06 0-.2-.03-.42-.16a3.4 3.4 0 0 1-.64-.49 3.2 3.2 0 0 1-.52-.63c-.13-.21-.17-.38-.17-.47v-9.6c0-.3.23-.7.66-1.06.2-.17.42-.31.63-.41.21-.1.37-.13.46-.13zM11.55 15.9V9.3h2.4v1.5h1.8v1.8h-1.8v2.85h1.8c.6 0 .3 1.2 0 1.65s-1.8.3-1.8.3-2.4 0-2.4-1.5z"
                    />
                </svg>
            ),
        };
    }

    // 24. Documenso / Sign
    if (id === 'documenso') {
        return {
            containerClass:
                'bg-emerald-500/10 ring-1 ring-emerald-500/25 text-[#16A34A]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M444 512H68c-37.6 0-68-30.4-68-68V68C0 30.4 30.4 0 68 0h376c37.6 0 68 30.4 68 68v376c0 37.6-30.4 68-68 68"
                        fill="#A7E575"
                    />
                    <path
                        d="M398.9 197c-.3-37.3-2.6-56-15.3-68.7s-31.4-15-68.5-15.3c-26.4-26-41.3-37.6-59.2-37.6s-32.8 11.6-59.3 37.7c-37.2.3-55.9 2.6-68.5 15.3-12.7 12.7-15 31.4-15.3 68.5-25.9 26.4-37.5 41.2-37.5 59 0 18 11.6 32.8 37.6 59.1.3 37.2 2.6 55.9 15.2 68.5s31.4 14.9 68.6 15.2c26.4 25.9 41.2 37.5 59.1 37.5s32.7-11.6 59.1-37.5c37.2-.3 55.9-2.6 68.6-15.2 12.6-12.6 14.9-31.3 15.2-68.4 25.9-26.4 37.5-41.2 37.5-59.1.2-17.8-11.4-32.6-37.3-59m-86.9 16.9-8.3 9.4c-2.1 2.3-3.4 5.5-3.6 8.8l-1.1 23.3c-.9 6.8-2.3 8-2.8 8.5s-1.9 1.8-8.7 2.9l-.4.1h-.9c-3.2.4-6.9.6-12.1.7l-11.1.7c-3.2-.1-6.3 1.2-8.8 3.4"
                        fill="#1B4D1B"
                    />
                </svg>
            ),
        };
    }

    // 25. Traefik
    if (id === 'traefik') {
        return {
            containerClass:
                'bg-cyan-500/10 ring-1 ring-cyan-500/25 text-[#0891B2]',
            icon: <SiTraefikproxy size={px} color="#24A1C1" />,
        };
    }

    // 26. Headlamp / Dashboard
    if (id === 'headlamp') {
        return {
            containerClass:
                'bg-purple-500/10 ring-1 ring-purple-500/25 text-[#7C3AED]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M460 324.9V204.7l-31.8-41.5v-70L326.1 56.6V0H185.9v56.6l-102 36.6v69.9L52 204.7V325l31.8 42.9L52 466.8 256.1 512 460 466.8l-31.8-98.9z"
                        fill="#7C3AED"
                    />
                    <circle cx="256" cy="265.8" r="102" fill="#FFF200" />
                </svg>
            ),
        };
    }

    // 27. Penpot / Design
    if (id === 'penpot') {
        return {
            containerClass:
                'bg-violet-500/10 ring-1 ring-violet-500/25 text-[#8B5CF6]',
            icon: <SiPenpot size={px} color="#8B5CF6" />,
        };
    }

    // 28. Reactive Resume / Resume
    if (id === 'resume') {
        return {
            containerClass:
                'bg-blue-500/10 ring-1 ring-blue-500/25 text-[#2563EB]',
            icon: <SiReactiveresume size={px} color="#2563EB" />,
        };
    }

    // 29. Yopass / Paste
    if (id === 'yopass') {
        return {
            containerClass:
                'bg-orange-500/10 ring-1 ring-orange-500/25 text-[#EA580C]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <defs>
                        <linearGradient
                            id="yopass-grad"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                        >
                            <stop offset="0%" stopColor="#009643" />
                            <stop offset="100%" stopColor="#1100E9" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M388.3 308.9c-39.4 0-73.8 22.2-89.8 55.4l-96-49.2c12.3-17.2 19.7-36.9 19.7-60.3 0-22.2-7.4-43.1-19.7-60.3l96-49.2c16 32 48 54.2 86.1 55.4 55.4 1.2 102.1-41.8 103.4-97.2C489.2 48 446.1 1.3 390.8 0S288.6 41.9 287.4 97.3c0 4.9 0 9.8 1.2 14.8l-113.2 57.8c-16-9.8-34.5-16-54.2-16-55.4 1.2-99.7 46.8-99.7 102.1s44.3 100.9 100.9 100.9c19.7 0 38.2-6.2 54.2-16l113.2 57.8c0 3.7-1.2 7.4-1.2 12.3 0 55.4 44.3 100.9 100.9 100.9 55.4 0 100.9-44.3 100.9-100.9-1.2-56.5-46.7-102.1-102.1-102.1m2.5-278.1c39.4 1.2 70.2 34.5 68.9 72.6-1.2 39.4-34.5 70.2-72.6 68.9-27.1-1.2-50.5-17.2-61.5-39.4-4.9-9.8-7.4-22.2-7.4-33.2 1.2-39.4 33.2-68.9 72.6-68.9"
                        fill="url(#yopass-grad)"
                    />
                    <circle
                        cx="388.3"
                        cy="102"
                        r="11"
                        fill="url(#yopass-grad)"
                    />
                    <circle
                        cx="422.8"
                        cy="102"
                        r="11"
                        fill="url(#yopass-grad)"
                    />
                    <circle cx="355" cy="102" r="11" fill="url(#yopass-grad)" />
                </svg>
            ),
        };
    }

    // 30. ExternalDNS / DNS
    if (id === 'external-dns') {
        return {
            containerClass:
                'bg-cyan-500/10 ring-1 ring-cyan-500/25 text-[#0891B2]',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    className={`${sizeClass} shrink-0 fill-none stroke-current`}
                    strokeWidth="1.75"
                >
                    <circle cx="12" cy="12" r="9" />
                    <path
                        d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
                        strokeLinecap="round"
                    />
                    <circle
                        cx="12"
                        cy="12"
                        r="2.5"
                        fill="currentColor"
                        stroke="none"
                    />
                </svg>
            ),
        };
    }

    // 31. Planka / Tasks
    if (id === 'planka') {
        return {
            containerClass:
                'bg-emerald-500/10 ring-1 ring-emerald-500/25 text-[#059669]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M263.7 166.3c0 15.8 12.8 28.7 28.7 28.7h162.3c15.8 0 28.7-12.8 28.7-28.7v-32c0-15.8-12.8-28.7-28.7-28.7H292.2c-15.8 0-28.7 12.8-28.7 28.7v32zm-235.1 2.2c0 14.7 12 26.8 26.8 26.8h138.2c14.7 0 26.8-12 26.8-26.8v-35.8c0-14.7-12-26.8-26.8-26.8h-138c-14.7 0-26.8 12-26.8 26.8v35.8zm0 211.3c0 14.7 12 26.8 26.8 26.8h138.2c14.7 0 26.8-12 26.8-26.8V344c0-14.7-12-26.8-26.8-26.8h-138c-14.7 0-26.8 12-26.8 26.8v35.8zm0 105.3c0 14.7 12 26.8 26.8 26.8h138.2c14.7 0 26.8-12 26.8-26.8v-35.8c0-14.7-12-26.8-26.8-26.8h-138c-14.7 0-26.8 12-26.8 26.8v35.8z"
                        fill="#059669"
                    />
                    <path
                        d="M252.7 62.6c0 14.7 12 26.8 26.8 26.8h138.2c14.7 0 26.8-12 26.8-26.8V26.8c0-14.7-12-26.8-26.8-26.8H279.4c-14.7 0-26.8 12-26.8 26.8zM28.6 62.6c0 14.7 12 26.8 26.8 26.8h138.2c14.7 0 26.8-12 26.8-26.8V26.8c0-14.7-12-26.8-26.8-26.8H55.4C40.7 0 28.6 12 28.6 26.8z"
                        fill="#10B981"
                    />
                </svg>
            ),
        };
    }

    // 32. Kutt / Links
    if (id === 'kutt') {
        return {
            containerClass:
                'bg-blue-600/10 ring-1 ring-blue-600/25 text-[#2563EB]',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    className={`${sizeClass} shrink-0 fill-current`}
                >
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a3 3 0 0 1 0 4.24l-3.18 3.18a3 3 0 0 1-4.24 0l-1.6-1.6a1 1 0 0 0-1.42 1.42l1.6 1.6a5 5 0 0 0 7.07 0l3.18-3.18a5 5 0 0 0 0-7.07l-1.6-1.6a1 1 0 0 0-1.41 0zm-5.4 11.4a1 1 0 0 0 0-1.4l-1.6-1.6a3 3 0 0 1 0-4.24l3.18-3.18a3 3 0 0 1 4.24 0l1.6 1.6a1 1 0 1 0 1.42-1.42l-1.6-1.6a5 5 0 0 0-7.07 0L6.29 9.04a5 5 0 0 0 0 7.07l1.6 1.6a1 1 0 0 0 1.41 0z" />
                    <path d="M8 12h8v2H8z" transform="rotate(-45 12 12)" />
                </svg>
            ),
        };
    }

    // 33. Sendrec / Record
    if (id === 'sendrec') {
        return {
            containerClass:
                'bg-indigo-500/10 ring-1 ring-indigo-500/25 text-[#6366F1]',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    className={`${sizeClass} shrink-0 fill-current`}
                >
                    <rect
                        x="2"
                        y="4"
                        width="15"
                        height="16"
                        rx="3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                    <polygon points="17 9 22 6 22 18 17 15 17 9" />
                    <circle cx="7" cy="9" r="2" fill="#EF4444" />
                </svg>
            ),
        };
    }

    // 34. Bulwark / Webmail
    if (id === 'bulwark') {
        return {
            containerClass:
                'bg-blue-500/10 ring-1 ring-blue-500/25 text-[#2563EB]',
            icon: (
                <svg viewBox="0 0 512 512" className={`${sizeClass} shrink-0`}>
                    <path
                        d="M189.9 285.9 23.6 136.6v59.6c0 6.6 3.8 15.7 8.4 20.3l19 19c4.7 4.7 8.4 13.8 8.4 20.3v95.3c0 19 5.1 35.5 14.8 50.5zm132.2 0 166.3-149.3v65.5c0 3.3-1.9 7.8-4.2 10.2l-27.3 27.3c-2.3 2.3-4.2 6.9-4.2 10.2v101.3c0 19-5.1 35.5-14.8 50.5zM256 328.5c-17.7 0-26.7-7-39.5-18.7L98.1 428.2c33.2 28.8 87 53.4 157.9 83.8 70.9-30.4 124.7-55 157.9-83.8L295.5 309.8c-12.8 11.7-21.8 18.7-39.5 18.7m-8.9-39.2L28.1 92.6c-2.4-2.2-4.4-6.7-4.4-9.9V58.8c0-3.3 2.6-6.6 5.8-7.3l77.8-17.9c3.2-.7 5.8 1.3 5.8 4.6v49L178.7 72c3.2-.7 5.8-4 5.8-7.3v-43c0-3.3 2.6-6.6 5.8-7.3L250.2.6c3.2-.7 8.4-.7 11.6 0l59.9 13.8c3.2.7 5.8 4 5.8 7.3v43.1c0 3.3 2.6 6.6 5.8 7.3L399 87.2v-49c0-3.3 2.6-5.4 5.8-4.6l77.8 17.9c3.2.7 5.8 4 5.8 7.3v23.8c0 3.3-2 7.7-4.4 9.9L264.9 289.3c-4.9 4.3-12.9 4.3-17.8 0"
                        fill="#2563EB"
                    />
                </svg>
            ),
        };
    }

    // 35. Redis / RedisInsight
    if (id === 'redis' || id === 'redisinsight') {
        return {
            containerClass:
                'bg-red-500/10 ring-1 ring-red-500/25 text-[#DC2626]',
            icon: <SiRedis size={px} color="#DC2626" />,
        };
    }

    // 36. PostgreSQL / pgAdmin
    if (id === 'postgres' || id === 'postgresql' || id === 'pgadmin') {
        return {
            containerClass:
                'bg-blue-500/10 ring-1 ring-blue-500/25 text-[#3B82F6]',
            icon: <SiPostgresql size={px} color="#3B82F6" />,
        };
    }

    // 37. MySQL / phpMyAdmin
    if (id === 'mysql') {
        return {
            containerClass:
                'bg-sky-500/10 ring-1 ring-sky-500/25 text-[#0284C7]',
            icon: <SiMysql size={px} color="#0284C7" />,
        };
    }
    if (id === 'phpmyadmin') {
        return {
            containerClass:
                'bg-sky-500/10 ring-1 ring-sky-500/25 text-[#0284C7]',
            icon: <SiPhpmyadmin size={px} color="#0284C7" />,
        };
    }

    // 38. MariaDB
    if (id === 'mariadb') {
        return {
            containerClass:
                'bg-teal-500/10 ring-1 ring-teal-500/25 text-[#0D9488]',
            icon: <SiMariadb size={px} color="#0D9488" />,
        };
    }

    // 39. MongoDB / Mongo Express
    if (id === 'mongodb' || id === 'mongo-express') {
        return {
            containerClass:
                'bg-emerald-500/10 ring-1 ring-emerald-500/25 text-[#059669]',
            icon: <SiMongodb size={px} color="#059669" />,
        };
    }

    // 40. Adminer
    if (id === 'adminer') {
        return {
            containerClass:
                'bg-blue-500/10 ring-1 ring-blue-500/25 text-[#2563EB]',
            icon: <SiAdminer size={px} color="#2563EB" />,
        };
    }

    // 41. Headless Chrome / headless-shell (Plex Commons' Render driver —
    // the real Kubernetes component is chromedp/headless-shell, a stripped
    // headless-Chromium build, not full Google Chrome, but it's the closest
    // recognizable brand mark a person will actually place at a glance.
    if (
        id === 'headless-shell' ||
        id === 'chrome' ||
        id === 'headless-chrome'
    ) {
        return {
            containerClass:
                'bg-amber-500/10 ring-1 ring-amber-500/25 text-[#EA4335]',
            icon: <SiGooglechrome size={px} color="#EA4335" />,
        };
    }

    return null;
}
