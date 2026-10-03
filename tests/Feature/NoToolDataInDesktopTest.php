<?php

/**
 * The CLI is the only place that describes a tool: its name, tagline, categories,
 * stack, logo and whether it is paid. Soon that comes from LaraKube Cloud through
 * the CLI, so a second copy in Desktop would drift. Desktop draws what it is sent.
 */
function desktopSources(): array
{
    $skip = ['/routes/', '/wayfinder/', '/actions/', '/components/ui/'];
    $files = [];

    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(resource_path('js'), FilesystemIterator::SKIP_DOTS)) as $file) {
        $path = str_replace('\\', '/', $file->getPathname());

        if (! preg_match('/\.(ts|tsx)$/', $path) || array_filter($skip, fn (string $part): bool => str_contains($path, $part)) !== []) {
            continue;
        }

        $files[substr($path, strlen(str_replace('\\', '/', resource_path('js'))) + 1)] = (string) file_get_contents($file->getPathname());
    }

    return $files;
}

test('Desktop keeps no table of tool names, taglines, categories or stacks', function (): void {
    $forbidden = ['TOOL_DISPLAY_NAMES', 'TOOL_TAGLINES', 'TOOL_STACKS', 'TOOL_CATEGORIES_MAP', 'GENERIC_CATEGORY_NAMES'];
    $found = [];

    foreach (desktopSources() as $file => $source) {
        foreach ($forbidden as $name) {
            if (str_contains($source, $name)) {
                $found[] = "{$file}: {$name}";
            }
        }
    }

    expect($found)->toBe([], 'Tool data belongs to the CLI: '.implode('; ', $found));
});

test('the logo renderer draws by the id the CLI sends, never by guessing from a name', function (): void {
    $source = desktopSources()['components/tool-logo.tsx'];

    expect($source)->not->toContain('slug ===')
        ->and($source)->not->toContain('engine.includes')
        ->and($source)->not->toContain('brand.includes')
        ->and($source)->toContain('tool?.logo');
});

test('Desktop does not branch on a specific tool, apart from the known leftovers', function (): void {
    // Shrink only. Each is logic that should move to the CLI (what a tool needs
    // installed first, which tool replaces another) and be sent as data.
    $known = ['pages/tools/index.tsx' => 6];
    // Setup's own tools (the CLI, kubectl) and cloud providers are not Cluster Tools.
    $skip = ['components/tool-logo.tsx', 'components/framework-logo.tsx', 'pages/servers/create.tsx', 'pages/readiness.tsx'];
    $found = [];

    foreach (desktopSources() as $file => $source) {
        if (in_array($file, $skip, true)) {
            continue;
        }

        $count = preg_match_all('/\b(?:tool|slug)\s*===\s*\'[a-z0-9-]+\'/', $source);

        if ($count > 0) {
            $found[$file] = $count;
        }
    }

    expect($found)->toBe($known, 'Desktop branches on a tool slug; send it from the CLI instead.');
});
