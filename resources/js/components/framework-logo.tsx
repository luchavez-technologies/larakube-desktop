import type { ReactNode } from 'react';
import {
    SiLaravel,
    SiStatamic,
    SiWordpress,
    SiNextdotjs,
    SiVite,
    SiAstro,
    SiDocusaurus,
    SiDjango,
    SiFastapi,
    SiNestjs,
    SiAdonisjs,
    SiSpringboot,
    SiDotnet,
    SiGo,
    SiRust,
} from '@icons-pack/react-simple-icons';
import { Code2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
    slug: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
};

type Visual = {
    icon: ReactNode;
    containerClass: string;
};

export default function FrameworkLogo({
    slug: rawSlug,
    size = 'md',
    className = '',
}: Props) {
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]/g, '');

    const visual = resolveVisual(slug);

    const sizeClasses = {
        xs: 'size-5 rounded-md p-0.5 [&_svg]:size-3.5',
        sm: 'size-7 rounded-lg p-1.5 [&_svg]:size-3.5',
        md: 'size-9.5 rounded-xl p-2 [&_svg]:size-5',
        lg: 'size-12 rounded-2xl p-2.5 [&_svg]:size-6',
    }[size];

    return (
        <div
            className={cn(
                'inline-flex shrink-0 items-center justify-center border shadow-2xs transition-transform duration-150',
                sizeClasses,
                visual.containerClass,
                className,
            )}
        >
            {visual.icon}
        </div>
    );
}

function resolveVisual(slug: string): Visual {
    switch (slug) {
        case 'laravel':
            return {
                icon: <SiLaravel />,
                containerClass:
                    'bg-[#FF2D20]/10 text-[#FF2D20] border-[#FF2D20]/25',
            };
        case 'statamic':
            return {
                icon: <SiStatamic />,
                containerClass:
                    'bg-[#FF269E]/10 text-[#FF269E] border-[#FF269E]/25',
            };
        case 'wordpress':
        case 'wp':
            return {
                icon: <SiWordpress />,
                containerClass:
                    'bg-[#21759B]/10 text-[#21759B] border-[#21759B]/25',
            };
        case 'emdash':
            return {
                icon: (
                    <div className="relative flex items-center justify-center font-black">
                        <span className="font-mono text-base leading-none font-black tracking-tighter text-amber-500">
                            —
                        </span>
                        <Sparkles className="absolute -top-1.5 -right-1.5 size-2.5 text-amber-400" />
                    </div>
                ),
                containerClass:
                    'bg-amber-500/10 text-amber-500 border-amber-500/25',
            };
        case 'nextjs':
        case 'next':
            return {
                icon: <SiNextdotjs />,
                containerClass: 'bg-ink/10 text-ink border-ink/20',
            };
        case 'vite':
            return {
                icon: <SiVite />,
                containerClass:
                    'bg-[#646CFF]/10 text-[#646CFF] border-[#646CFF]/25',
            };
        case 'astro':
            return {
                icon: <SiAstro />,
                containerClass:
                    'bg-[#FF5D01]/10 text-[#FF5D01] border-[#FF5D01]/25',
            };
        case 'docusaurus':
        case 'docs':
            return {
                icon: <SiDocusaurus />,
                containerClass:
                    'bg-[#3ECC5F]/10 text-[#3ECC5F] border-[#3ECC5F]/25',
            };
        case 'django':
            return {
                icon: <SiDjango />,
                containerClass:
                    'bg-[#0C4B33]/15 text-[#0C4B33] border-[#0C4B33]/30',
            };
        case 'fastapi':
            return {
                icon: <SiFastapi />,
                containerClass:
                    'bg-[#009688]/10 text-[#009688] border-[#009688]/25',
            };
        case 'nestjs':
            return {
                icon: <SiNestjs />,
                containerClass:
                    'bg-[#E0234E]/10 text-[#E0234E] border-[#E0234E]/25',
            };
        case 'adonisjs':
        case 'adonis':
            return {
                icon: <SiAdonisjs />,
                containerClass:
                    'bg-[#5A45FF]/10 text-[#5A45FF] border-[#5A45FF]/25',
            };
        case 'springboot':
        case 'spring':
            return {
                icon: <SiSpringboot />,
                containerClass:
                    'bg-[#6DB33F]/10 text-[#6DB33F] border-[#6DB33F]/25',
            };
        case 'dotnet':
            return {
                icon: <SiDotnet />,
                containerClass:
                    'bg-[#512BD4]/10 text-[#512BD4] border-[#512BD4]/25',
            };
        case 'gin':
        case 'go':
            return {
                icon: <SiGo />,
                containerClass:
                    'bg-[#00ADD8]/10 text-[#00ADD8] border-[#00ADD8]/25',
            };
        case 'axum':
        case 'rust':
            return {
                icon: <SiRust />,
                containerClass:
                    'bg-[#DEA584]/15 text-[#CE412B] border-[#DEA584]/30',
            };
        default:
            return {
                icon: <Code2 />,
                containerClass: 'bg-surface text-soft border-line',
            };
    }
}

export {
    default as FrameworkBadge,
    frameworkLabels,
    resolveFrameworkLabel,
} from '@/components/framework-badge';
