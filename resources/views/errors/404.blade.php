<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Resource Not Found — {{ config('app.name', 'LaraKube') }}</title>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        <script>
            (function() {
                try {
                    const theme = @json(rescue(fn () => app(\App\Services\LaraKube\GlobalSettings::class)->getTheme(), 'system', false));
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    if (theme === 'dark' || (theme === 'system' && prefersDark)) {
                        document.documentElement.classList.add('dark');
                    } else {
                        document.documentElement.classList.remove('dark');
                        if (theme === 'light') {
                            document.documentElement.classList.add('light');
                        }
                    }
                } catch (e) {}
            })();
        </script>

        @fonts
        @vite(['resources/css/app.css'])
    </head>
    <body class="font-sans antialiased bg-canvas text-ink min-h-screen flex items-center justify-center p-6 selection:bg-brand selection:text-white">
        <div class="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-xl text-center space-y-6">
            <div class="mx-auto flex size-16 items-center justify-center rounded-2xl border border-line bg-paper text-soft shadow-xs">
                <svg class="size-8 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
                    <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
                    <line x1="6" x2="6.01" y1="6" y2="6" />
                    <line x1="6" x2="6.01" y1="18" y2="18" />
                    <path d="m15 10-3 4" />
                    <path d="m12 10 3 4" />
                </svg>
            </div>

            <div class="space-y-2">
                <div class="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent ring-1 ring-accent/20">
                    404 &bull; Not Found
                </div>
                <h1 class="text-xl font-bold tracking-tight text-ink">Resource Not Found</h1>
                <p class="text-xs text-soft leading-relaxed">
                    The requested server, cluster, or project could not be found. It may have been renamed, removed, or the connection details updated.
                </p>
            </div>

            <div class="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                <a href="/servers" class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-hover">
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
                        <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
                        <line x1="6" x2="6.01" y1="6" y2="6" />
                        <line x1="6" x2="6.01" y1="18" y2="18" />
                    </svg>
                    <span>View Servers</span>
                </a>
                <a href="/projects" class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink shadow-xs transition hover:bg-paper/80">
                    <svg class="size-4 text-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>Return to Projects</span>
                </a>
            </div>
        </div>
    </body>
</html>
