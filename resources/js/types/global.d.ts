import type { Auth } from '@/types/auth';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            sidebarOpen: boolean;
            versions: {
                desktop: string;
                cli: string | null;
                wslCli?: string | null;
                hasWslCli?: boolean;
            };
            [key: string]: unknown;
        };
    }
}
