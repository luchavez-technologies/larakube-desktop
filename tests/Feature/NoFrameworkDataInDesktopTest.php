<?php

use Illuminate\Support\Facades\File;

/**
 * The CLI describes every framework a new app can start from, and the questions
 * each one asks (`new:frameworks --json`). Desktop draws that, so a framework
 * is added or changed in the CLI alone and nothing here can drift from it.
 */
test('Desktop keeps no table of frameworks, their categories or their defaults', function (): void {
    $forbidden = ['SCAFFOLDERS', 'WIZARD_FRAMEWORKS', 'FRAMEWORK_META', 'const CATEGORIES', 'categoryBadgeLabel', 'DEPLOYABLE'];
    $sources = [
        ...desktopSources(),
        ...collect(File::allFiles(app_path()))->mapWithKeys(fn (SplFileInfo $file): array => ["app/{$file->getRelativePathname()}" => (string) file_get_contents($file->getPathname())])->all(),
    ];
    $found = [];

    foreach ($sources as $file => $source) {
        foreach ($forbidden as $name) {
            if (str_contains($source, $name)) {
                $found[] = "{$file}: {$name}";
            }
        }
    }

    expect($found)->toBe([], 'Framework data belongs to the CLI: '.implode('; ', $found));
});

test('the New project form never branches on a framework or a field name', function (): void {
    $source = desktopSources()['pages/projects/create.tsx'];

    expect($source)->not->toMatch('/framework(\.data\.framework)?\s*===\s*[\'"]/')
        ->and($source)->not->toMatch('/slug\s*===\s*[\'"]/')
        ->and($source)->not->toMatch('/field\.key\s*===\s*[\'"]/');
});
