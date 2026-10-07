import type { ReactNode } from 'react';
import {
    SiPhpstorm,
    SiPycharm,
    SiWebstorm,
    SiGoland,
    SiRubymine,
    SiRider,
    SiIntellijidea,
    SiCursor,
    SiSublimetext,
    SiZedindustries,
    SiWindsurf,
    SiRust,
} from '@icons-pack/react-simple-icons';
import { Code2 } from 'lucide-react';
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

const VS_CODE_PATH =
    'M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z';

export default function EditorLogo({
    slug: rawSlug,
    size = 'sm',
    className = '',
}: Props) {
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const visual = resolveVisual(slug);

    const sizeClasses = {
        xs: 'size-5 rounded-md p-0.5 [&_svg]:size-3.5',
        sm: 'size-6 rounded-md p-1 [&_svg]:size-3.5',
        md: 'size-8 rounded-lg p-1.5 [&_svg]:size-4',
        lg: 'size-10 rounded-xl p-2 [&_svg]:size-5',
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
        case 'vscode':
        case 'code':
        case 'visualstudiocode':
            return {
                icon: (
                    <svg
                        viewBox="0 0 24 24"
                        className="size-full shrink-0"
                        fill="currentColor"
                    >
                        <path d={VS_CODE_PATH} />
                    </svg>
                ),
                containerClass:
                    'bg-[#007ACC]/10 text-[#007ACC] border-[#007ACC]/25',
            };
        case 'phpstorm':
            return {
                icon: <SiPhpstorm />,
                containerClass:
                    'bg-[#B111C9]/10 text-[#B111C9] border-[#B111C9]/25',
            };
        case 'pycharm':
            return {
                icon: <SiPycharm />,
                containerClass:
                    'bg-[#21D789]/10 text-[#21D789] border-[#21D789]/25',
            };
        case 'webstorm':
            return {
                icon: <SiWebstorm />,
                containerClass:
                    'bg-[#00CDFF]/10 text-[#00CDFF] border-[#00CDFF]/25',
            };
        case 'goland':
            return {
                icon: <SiGoland />,
                containerClass:
                    'bg-[#00ADD8]/10 text-[#00ADD8] border-[#00ADD8]/25',
            };
        case 'rustrover':
            return {
                icon: <SiRust />,
                containerClass:
                    'bg-[#DEA584]/10 text-[#DEA584] border-[#DEA584]/25',
            };
        case 'rubymine':
            return {
                icon: <SiRubymine />,
                containerClass:
                    'bg-[#FC2847]/10 text-[#FC2847] border-[#FC2847]/25',
            };
        case 'rider':
            return {
                icon: <SiRider />,
                containerClass:
                    'bg-[#E51664]/10 text-[#E51664] border-[#E51664]/25',
            };
        case 'idea':
        case 'intellij':
        case 'intellijidea':
            return {
                icon: <SiIntellijidea />,
                containerClass:
                    'bg-[#FE315D]/10 text-[#FE315D] border-[#FE315D]/25',
            };
        case 'cursor':
            return {
                icon: <SiCursor />,
                containerClass: 'bg-ink/10 text-ink border-line',
            };
        case 'zed':
            return {
                icon: <SiZedindustries />,
                containerClass:
                    'bg-[#4E75F6]/10 text-[#4E75F6] border-[#4E75F6]/25',
            };
        case 'windsurf':
            return {
                icon: <SiWindsurf />,
                containerClass:
                    'bg-[#09B6A2]/10 text-[#09B6A2] border-[#09B6A2]/25',
            };
        case 'sublime':
        case 'sublimetext':
            return {
                icon: <SiSublimetext />,
                containerClass:
                    'bg-[#FF9800]/10 text-[#FF9800] border-[#FF9800]/25',
            };
        default:
            return {
                icon: <Code2 className="size-full shrink-0" />,
                containerClass: 'bg-brand/10 text-brand border-brand/25',
            };
    }
}
