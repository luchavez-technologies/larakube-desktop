import { Code2 } from 'lucide-react';
import FrameworkLogo from '@/components/framework-logo';
import { cn } from '@/lib/utils';

export const frameworkLabels: Record<string, string> = {
    laravel: 'Laravel',
    statamic: 'Statamic',
    wordpress: 'WordPress',
    wp: 'WordPress',
    emdash: 'Emdash',
    nextjs: 'Next.js',
    next: 'Next.js',
    vite: 'Vite',
    astro: 'Astro',
    docusaurus: 'Docusaurus',
    docs: 'Docusaurus',
    django: 'Django',
    fastapi: 'FastAPI',
    nestjs: 'NestJS',
    adonisjs: 'AdonisJS',
    adonis: 'AdonisJS',
    springboot: 'Spring Boot',
    spring: 'Spring Boot',
    dotnet: '.NET',
    gin: 'Gin',
    go: 'Go',
    axum: 'Axum',
    rust: 'Rust',
};

export function resolveFrameworkLabel(slug?: string | null): string {
    if (!slug) return '—';
    const clean = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    return (
        frameworkLabels[clean] ??
        frameworkLabels[slug.toLowerCase()] ??
        slug.charAt(0).toUpperCase() + slug.slice(1)
    );
}

type Props = {
    slug?: string | null;
    size?: 'sm' | 'md';
    className?: string;
};

export default function FrameworkBadge({
    slug: rawSlug,
    size = 'sm',
    className = '',
}: Props) {
    if (!rawSlug || rawSlug === '—' || rawSlug === 'unknown') {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2 py-0.5 text-xs text-soft',
                    className,
                )}
            >
                <Code2 className="size-3 text-soft" />
                <span>{rawSlug === 'unknown' ? 'Unknown' : '—'}</span>
            </span>
        );
    }

    const label = resolveFrameworkLabel(rawSlug);

    return (
        <span
            className={cn(
                'hover:border-line-hover inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/90 font-medium text-ink shadow-2xs transition-colors',
                size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
                className,
            )}
        >
            <FrameworkLogo slug={rawSlug} size="xs" className="shrink-0" />
            <span className="truncate">{label}</span>
        </span>
    );
}
