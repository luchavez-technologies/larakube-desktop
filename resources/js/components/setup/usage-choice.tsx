import { router } from '@inertiajs/react';
import { Check, Code2, Wrench } from 'lucide-react';
import ProviderLogo from '@/components/provider-logo';
import { cn } from '@/lib/utils';

const USAGES: {
    value: 'tools' | 'apps';
    title: string;
    detail: string;
    icon: typeof Wrench;
    accent: string;
    /** Slugs ProviderLogo already renders — shown so someone can see exactly what this path installs before picking it, not just read a sentence about it. */
    installs: string[];
    size: string;
}[] = [
    {
        value: 'tools',
        title: 'Install tools on a server',
        detail: 'Create servers and set up chat, a wiki, sign-in and more for your team. Nothing runs on this computer.',
        icon: Wrench,
        accent: 'tools',
        installs: ['kubectl', 'tofu'],
        size: '~150MB download',
    },
    {
        value: 'apps',
        title: 'Build and run apps here',
        detail: 'Everything above, plus creating apps and running them on this computer to work on them.',
        icon: Code2,
        accent: 'brand',
        installs: ['kubectl', 'tofu', 'docker', 'git'],
        size: '~300MB+ with a container runtime',
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
                                <span className="mt-2.5 flex items-center gap-1.5">
                                    {option.installs.map((slug) => (
                                        <ProviderLogo
                                            key={slug}
                                            slug={slug}
                                            size="xs"
                                        />
                                    ))}
                                    <span className="ml-1 text-[11px] text-faint">
                                        {option.size}
                                    </span>
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
