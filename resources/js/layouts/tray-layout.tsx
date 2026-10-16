import { Head, usePage } from '@inertiajs/react';
import { useEffect, type ReactNode } from 'react';

type Props = {
    title?: string;
    children: ReactNode;
};

export default function TrayLayout({
    title = 'LaraKube Control Center',
    children,
}: Props) {
    const { props } = usePage<{ theme?: string }>();

    useEffect(() => {
        const theme = props.theme || 'system';
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            const isDark =
                theme === 'dark' || (theme === 'system' && media.matches);
            if (isDark) {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
            } else {
                document.documentElement.classList.remove('dark');
                if (theme === 'light') {
                    document.documentElement.classList.add('light');
                } else {
                    document.documentElement.classList.remove('light');
                }
            }
        };

        apply();

        if (theme === 'system') {
            media.addEventListener('change', apply);
            return () => media.removeEventListener('change', apply);
        }
    }, [props.theme]);

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-surface font-sans text-xs text-ink antialiased select-none">
            <Head title={title} />
            {children}
        </div>
    );
}
