import { createInertiaApp } from '@inertiajs/react';
import type { ComponentType } from 'react';
import { defaultLayout } from '@/layouts/app-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

type InertiaPage = ComponentType<any> & { layout?: any };

void createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) => {
        const pages = import.meta.glob<{ default: InertiaPage }>(
            './pages/**/*.tsx',
            { eager: true },
        );
        const page = pages[`./pages/${name}.tsx`];
        if (!page) {
            throw new Error(`Page not found: ./pages/${name}.tsx`);
        }

        const component = page.default;
        if (component.layout === undefined) {
            component.layout = defaultLayout;
        }

        return component;
    },
    progress: {
        color: '#4f46e5',
        delay: 100,
        showSpinner: false,
    },
});
