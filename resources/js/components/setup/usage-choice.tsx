import { router } from '@inertiajs/react';
import { Check, Code2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const USAGES: {
    value: 'tools' | 'apps';
    title: string;
    detail: string;
    highlights: string[];
    icon: typeof Wrench;
    accent: string;
    footnote: string;
}[] = [
    {
        value: 'tools',
        title: 'Servers & Cluster Tools',
        detail: 'Provision cloud servers and deploy self-hosted apps for your team.',
        highlights: [
            'Create & manage cloud servers (VPS, EKS, GKE)',
            'Deploy 45+ Cluster Tools (chat, wiki, auth, storage, n8n)',
            'Manage domains, TLS, backups & Plex Commons',
        ],
        icon: Wrench,
        accent: 'tools',
        footnote: 'Nothing runs locally · ~150MB download',
    },
    {
        value: 'apps',
        title: 'Local development',
        detail: 'Everything in Servers & Cluster Tools, plus:',
        highlights: [
            'Build & preview Laravel, Next.js, Vite, Django & more locally',
            'Run a local Kubernetes cluster on this computer',
            'Unlocks Projects & Dev Boxes in the sidebar',
        ],
        icon: Code2,
        accent: 'brand',
        footnote: 'Requires a container runtime (and WSL on Windows) · ~300MB+',
    },
];

const ACCENT_BADGE: Record<string, string> = {
    tools: 'bg-tools/10 text-tools',
    brand: 'bg-brand/10 text-brand',
};

/** "What will you use LaraKube Desktop for?" Shared by the Setup page and the onboarding wizard's persona step — both post to the same `/setup/usage` endpoint, which also derives whether Projects/Dev Boxes stay in the sidebar. */
export default function UsageChoice({
    usage,
    prompt = 'What will you use LaraKube Desktop for?',
}: {
    usage: 'tools' | 'apps' | null;
    prompt?: string;
}) {
    return (
        <div className="mb-4.5">
            <p className="mb-2 text-sm font-medium">
                {prompt}
                {usage === null && (
                    <span className="ml-2 font-normal text-accent">
                        Choose one
                    </span>
                )}
            </p>
            <div
                role="radiogroup"
                aria-label="What this computer is for"
                className="grid grid-cols-2 gap-3"
            >
                {USAGES.map((option) => {
                    const selected = usage === option.value;
                    const Icon = option.icon;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() =>
                                router.post(
                                    '/setup/usage',
                                    { usage: option.value },
                                    {
                                        preserveScroll: true,
                                        // 'wsl' is a deferred prop gated on
                                        // usage === 'apps' server-side (see
                                        // OnboardingController/ReadinessController)
                                        // specifically to avoid probing
                                        // wsl.exe — and the native install
                                        // prompt that triggers — for a
                                        // "tools"-only user. Without
                                        // re-requesting it here, switching
                                        // to "apps" would leave it stuck at
                                        // whatever it resolved to before a
                                        // persona was chosen.
                                        only: ['usage', 'hideProjects', 'wsl'],
                                    },
                                )
                            }
                            className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-left transition',
                                selected
                                    ? 'border-accent bg-accent-tint'
                                    : 'border-line bg-surface hover:border-faint hover:bg-paper',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                                    ACCENT_BADGE[option.accent],
                                )}
                            >
                                <Icon className="size-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">
                                    {option.title}
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-soft">
                                    {option.detail}
                                </span>
                                <ul className="mt-2.5 space-y-1 text-xs text-soft">
                                    {option.highlights.map((item) => (
                                        <li
                                            key={item}
                                            className="flex items-start gap-1.5"
                                        >
                                            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                                <span className="mt-2.5 block text-[11px] text-faint">
                                    {option.footnote}
                                </span>
                            </span>
                            <span
                                aria-hidden="true"
                                className={cn(
                                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                                    selected
                                        ? 'border-accent bg-accent text-white'
                                        : 'border-faint bg-surface',
                                )}
                            >
                                {selected && <Check className="size-3" />}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
