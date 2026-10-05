<?php

/**
 * Every tool the app runs goes through ToolLocator::isolate() / run() / start(), which is the one place
 * that knows how Windows runs a command (inside the LaraKube WSL distro). A file that launches a process
 * on its own would silently run on the wrong side of that line on Windows.
 */
test('processes are launched only through ToolLocator, apart from the few files that are listed here', function (): void {
    $allowed = [
        // The Windows side itself: asks wsl.exe about WSL and the distro, so it cannot go through the distro.
        'app/Services/Wsl.php',
        // Not yet distro-aware. Plan 10 step 3 (setup flow) and step 4 (editors); remove each when it is.
        'app/Services/Elevation.php',
        'app/Services/EditorLauncher.php',
    ];

    $found = [];
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(base_path('app')));

    foreach ($files as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }

        $relative = str_replace(base_path().'/', '', $file->getPathname());
        $source = (string) file_get_contents($file->getPathname());

        if ($relative === 'app/Services/LaraKube/ToolLocator.php' || str_contains($source, '->isolate(')) {
            continue;
        }

        if (preg_match('/\bProcess::(run|start|env|timeout|path|input)\(|\bChildProcess::start\(/', $source) === 1) {
            $found[] = $relative;
        }
    }

    sort($found);
    sort($allowed);

    expect($found)->toBe($allowed);
});
