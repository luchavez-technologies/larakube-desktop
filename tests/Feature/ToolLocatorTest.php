<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

test('isolated commands see only the allowlisted environment, not the parent app env', function () {
    putenv('DB_CONNECTION=sqlite');
    putenv('APP_CONFIG_CACHE=/tmp/desktop-config.php');

    try {
        $isolated = (new ToolLocator(['/usr/bin', '/bin']))->isolate(['/usr/bin/env'], ['TF_VAR_do_token' => 'dop_v1_secret']);

        $result = Process::env($isolated['environment'])->run($isolated['command'])->throw();

        $variables = array_filter(explode("\n", trim($result->output())));

        expect($variables)->toContain('TF_VAR_do_token=dop_v1_secret')
            ->toContain('PATH=/usr/bin:/bin')
            ->and(implode("\n", $variables))->not->toContain('DB_CONNECTION')
            ->not->toContain('APP_CONFIG_CACHE')
            ->and(implode(' ', $isolated['command']))->not->toContain('dop_v1_secret');
    } finally {
        putenv('DB_CONNECTION');
        putenv('APP_CONFIG_CACHE');
    }
});

test('the default directory list covers Homebrew sbin, where dnsmasq actually installs', function () {
    // Homebrew installs daemon-style formulae like dnsmasq into *sbin*, not
    // *bin* — bin-only coverage left a correctly-installed dnsmasq permanently
    // reported as "Missing" on the Setup page.
    $directories = (new ToolLocator(windows: false))->directories();

    expect($directories)->toContain('/opt/homebrew/sbin')
        ->toContain('/usr/local/sbin')
        ->toContain('/home/linuxbrew/.linuxbrew/sbin');
});

test('invalid variable names are rejected before reaching the shell', function () {
    (new ToolLocator(['/usr/bin']))->isolate(['/usr/bin/true'], ['BAD;NAME' => 'x']);
})->throws(InvalidArgumentException::class);

test('darwin refuses /usr/bin/git when xcode command line tools are missing', function () {
    Process::fake([
        '*/usr/bin/xcode-select*-p*' => Process::result(output: 'xcode-select: error', exitCode: 2),
    ]);

    $locator = new ToolLocator(['/usr/bin'], darwin: true);

    expect($locator->find('git'))->toBeNull();
});

test('darwin accepts /usr/bin/git when xcode command line tools are present', function () {
    if (! is_file('/usr/bin/git')) {
        test()->markTestSkipped('/usr/bin/git does not exist on this machine');
    }

    Process::fake([
        '*/usr/bin/xcode-select*-p*' => Process::result(output: '/Library/Developer/CommandLineTools', exitCode: 0),
    ]);

    $locator = new ToolLocator(['/usr/bin'], darwin: true);

    expect($locator->find('git'))->toBe('/usr/bin/git');
});

// --- Windows native tool resolution (kubectl/k9s/tofu/aws/gcloud installed
// directly on the host by CliTool.php, no larakube-ubuntu distro involved) ---

test('windows finds a natively-installed kubectl.exe without ever asking the WSL distro', function () {
    $dir = sys_get_temp_dir().'/larakube-toollocator-'.bin2hex(random_bytes(6));
    mkdir($dir, 0777, true);
    file_put_contents($dir.'/kubectl.exe', 'fake-kubectl');

    // Process::fake() with no patterns registered would fail the test if
    // find() fell through to findInDistro(), which shells out to wsl.exe.
    Process::fake();

    $locator = new ToolLocator([$dir], windows: true);

    expect($locator->find('kubectl'))->toBe($dir.'/kubectl.exe');
    Process::assertNothingRan();
});

test('windows resolves gcloud to its .cmd wrapper, not a bare .exe', function () {
    $dir = sys_get_temp_dir().'/larakube-toollocator-'.bin2hex(random_bytes(6));
    mkdir($dir, 0777, true);
    file_put_contents($dir.'/gcloud.cmd', 'fake-gcloud-wrapper');

    Process::fake();

    $locator = new ToolLocator([$dir], windows: true);

    expect($locator->find('gcloud'))->toBe($dir.'/gcloud.cmd');
});

test('a natively-dispatched larakube.exe gets a PATH that finds the native-Windows tool installs, not just whatever Desktop inherited', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $oldLocalAppData = getenv('LOCALAPPDATA');
    putenv('USERPROFILE=C:\\Users\\jamie');
    putenv('LOCALAPPDATA=C:\\Users\\jamie\\AppData\\Local');
    putenv('PATH=C:\\Windows\\System32');

    try {
        $locator = new ToolLocator(windows: true);
        $isolated = $locator->isolate(['C:\\Users\\jamie\\.larakube\\bin\\larakube.exe', 'cloud:create']);

        expect($isolated['environment']['PATH'])
            ->toContain('C:\\Users\\jamie\\.larakube\\bin')
            ->toContain('C:\\Users\\jamie\\google-cloud-sdk\\bin')
            ->toContain('C:\\Users\\jamie\\AppData\\Local\\Programs\\Amazon\\AWSCLIV2')
            // The inherited System32 entry must still be present — losing it
            // would break anything the dispatched process shells out to
            // beyond the four CliTool-managed locations (e.g. ssh.exe).
            ->toContain('C:\\Windows\\System32');
    } finally {
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
        $oldLocalAppData === false ? putenv('LOCALAPPDATA') : putenv("LOCALAPPDATA={$oldLocalAppData}");
    }
});

test('a natively-dispatched larakube.exe never gets an empty VIEW_COMPILED_PATH, since larakube.exe is a real Laravel app that reads it directly', function () {
    // Confirmed live (2026-10-30): forcing VIEW_COMPILED_PATH='' here was
    // meant to stop Desktop's own env from leaking into the CLI child
    // process, but Desktop never sets this var in the first place, and
    // cli/config/view.php consumes it directly (no file_exists() guard,
    // unlike the APP_*_CACHE paths) as the Blade-compiled-view directory —
    // an empty string would break any larakube.exe command that renders a
    // Blade view once dispatched natively from Desktop.
    $locator = new ToolLocator(windows: true);
    $isolated = $locator->isolate(['C:\\Users\\jamie\\.larakube\\bin\\larakube.exe', '--version']);

    expect($isolated['environment'])->not->toHaveKey('VIEW_COMPILED_PATH');
});

test('windows finds ssh.exe at the OpenSSH optional feature\'s fixed install path, not inside the WSL distro', function () {
    $oldSystemRoot = getenv('SystemRoot');
    $sysRoot = sys_get_temp_dir().'/larakube-toollocator-sysroot-'.bin2hex(random_bytes(6));
    $sshDir = "{$sysRoot}/System32/OpenSSH";
    mkdir($sshDir, 0777, true);
    file_put_contents("{$sshDir}/ssh.exe", 'fake-ssh');
    putenv("SystemRoot={$sysRoot}");

    // Process::fake() with no patterns registered would fail the test if
    // find() fell through to findInDistro(), which shells out to wsl.exe —
    // ssh is never CLI-installed, so it would otherwise only ever be found
    // (or not) inside the distro, giving a misleading status for the
    // native-Windows `cloud:create` path this is actually needed for.
    Process::fake();

    try {
        $locator = new ToolLocator(windows: true);

        expect($locator->find('ssh'))->toBe("{$sshDir}/ssh.exe");
        Process::assertNothingRan();
    } finally {
        $oldSystemRoot === false ? putenv('SystemRoot') : putenv("SystemRoot={$oldSystemRoot}");
    }
});

test('windows reports ssh missing, not found-in-WSL, when the OpenSSH optional feature isn\'t installed', function () {
    $oldSystemRoot = getenv('SystemRoot');
    $sysRoot = sys_get_temp_dir().'/larakube-toollocator-sysroot-'.bin2hex(random_bytes(6));
    putenv("SystemRoot={$sysRoot}");

    Process::fake([
        '*' => Process::result('', exitCode: 1),
    ]);

    try {
        $locator = new ToolLocator(windows: true);

        expect($locator->find('ssh'))->toBeNull();
    } finally {
        $oldSystemRoot === false ? putenv('SystemRoot') : putenv("SystemRoot={$oldSystemRoot}");
    }
});

test('windows still asks the WSL distro for a tool with no native Windows installer', function () {
    // findInDistro() runs an ARRAY command — wsl.exe/which/the binary name
    // are separate elements, so the fake pattern matches the binary-name
    // element alone rather than a joined "which hcloud" substring.
    Process::fake([
        '*hcloud*' => Process::result(output: '/home/larakube/.larakube/bin/hcloud'),
    ]);

    // directories: null forces the real findInDistro() path (the injected-
    // directories branch above is a test-only shortcut that bypasses it).
    // wslFeatureEnabled: true — this test is about the distro lookup
    // itself, not the "WSL isn't even on" short-circuit ahead of it.
    $locator = new ToolLocator(windows: true, wslFeatureEnabled: true);

    expect($locator->find('hcloud'))->toBe('/home/larakube/.larakube/bin/hcloud');
});

test('windows never asks the WSL distro when the WSL optional component itself is not on', function () {
    // Confirmed live (2026-10-30): wsl.exe, with ANY subcommand or flags,
    // pops Windows's own native "WSL is not installed, press any key to
    // install" console prompt the instant the feature isn't present —
    // findInDistro() must never reach it in that state.
    Process::fake();

    $locator = new ToolLocator(windows: true, wslFeatureEnabled: false);

    expect($locator->find('hcloud'))->toBeNull()
        ->and($locator->lastFailure())->toBe('Windows Subsystem for Linux (WSL) is not turned on.');

    Process::assertNothingRan();
});

test('windows finds gcloud installed via Google official installer under LOCALAPPDATA and includes it in PATH', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $oldLocalAppData = getenv('LOCALAPPDATA');
    $profileDir = sys_get_temp_dir().'/larakube-profile-'.bin2hex(random_bytes(6));
    $localAppDataDir = sys_get_temp_dir().'/larakube-localappdata-'.bin2hex(random_bytes(6));
    $gcloudBinDir = "{$localAppDataDir}/Google/Cloud SDK/google-cloud-sdk/bin";
    mkdir($profileDir, 0777, true);
    mkdir($gcloudBinDir, 0777, true);
    file_put_contents("{$gcloudBinDir}/gcloud.cmd", '@echo off');

    putenv("USERPROFILE={$profileDir}");
    putenv("LOCALAPPDATA={$localAppDataDir}");
    Process::fake();

    try {
        $locator = new ToolLocator(windows: true);
        $isolated = $locator->isolate(['C:\\Users\\jamie\\.larakube\\bin\\larakube.exe', 'cloud:providers']);

        expect($locator->find('gcloud'))->toBe("{$gcloudBinDir}/gcloud.cmd")
            ->and($isolated['environment']['PATH'])->toContain("{$localAppDataDir}\\Google\\Cloud SDK\\google-cloud-sdk\\bin");
        Process::assertNothingRan();
    } finally {
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
        $oldLocalAppData === false ? putenv('LOCALAPPDATA') : putenv("LOCALAPPDATA={$oldLocalAppData}");
    }
});

test('native Windows isolation unsets Desktop cache and storage vars with false and executes PHP processes without leaking them', function () {
    $oldConfigCache = getenv('APP_CONFIG_CACHE');
    $oldServicesCache = getenv('APP_SERVICES_CACHE');
    $oldStoragePath = getenv('LARAVEL_STORAGE_PATH');
    putenv('APP_CONFIG_CACHE=/tmp/desktop-config.php');
    putenv('APP_SERVICES_CACHE=/tmp/desktop-services.php');
    putenv('LARAVEL_STORAGE_PATH=/tmp/desktop-storage');

    try {
        $locator = new ToolLocator(windows: true);
        $isolated = $locator->isolate(['C:\\Users\\jamie\\.larakube\\bin\\larakube.exe', '--version']);

        expect($isolated['environment']['APP_CONFIG_CACHE'])->toBeFalse()
            ->and($isolated['environment']['APP_SERVICES_CACHE'])->toBeFalse()
            ->and($isolated['environment']['APP_PACKAGES_CACHE'])->toBeFalse()
            ->and($isolated['environment']['APP_ROUTES_CACHE'])->toBeFalse()
            ->and($isolated['environment']['APP_EVENTS_CACHE'])->toBeFalse()
            ->and($isolated['environment']['LARAVEL_STORAGE_PATH'])->toBeFalse()
            ->and($isolated['environment']['NATIVEPHP_RUNNING'])->toBeFalse();

        // Execute a real child PHP process through Symfony Process using that exact
        // isolated env array: `false` must unset every leaked parent variable so
        // `getenv(...)` returns false instead of an empty string `""`.
        $probe = Process::env($isolated['environment'])
            ->path(sys_get_temp_dir())
            ->run([
                PHP_BINARY,
                '-r',
                'echo json_encode(["cfg" => getenv("APP_CONFIG_CACHE"), "srv" => getenv("APP_SERVICES_CACHE"), "sto" => getenv("LARAVEL_STORAGE_PATH")]);',
            ])
            ->throw();

        expect(json_decode($probe->output(), true))->toBe([
            'cfg' => false,
            'srv' => false,
            'sto' => false,
        ]);
    } finally {
        $oldConfigCache === false ? putenv('APP_CONFIG_CACHE') : putenv("APP_CONFIG_CACHE={$oldConfigCache}");
        $oldServicesCache === false ? putenv('APP_SERVICES_CACHE') : putenv("APP_SERVICES_CACHE={$oldServicesCache}");
        $oldStoragePath === false ? putenv('LARAVEL_STORAGE_PATH') : putenv("LARAVEL_STORAGE_PATH={$oldStoragePath}");
    }
});

test('ToolLocator::start omits boolean false unset markers so Electron ChildProcess never stringifies them', function () {
    $fake = ChildProcess::fake();
    $locator = new ToolLocator(windows: true);

    $locator->start(['C:\\Users\\jamie\\.larakube\\bin\\larakube.exe', 'update', '--yes'], 'test-update');

    $fake->assertStarted(function (array|string $cmd, string $alias, ?string $cwd = null, ?array $env = null, bool $persistent = false): bool {
        $env ??= [];

        return ($env['NO_COLOR'] ?? null) === '1'
            && ! array_key_exists('APP_CONFIG_CACHE', $env)
            && ! array_key_exists('APP_SERVICES_CACHE', $env)
            && ! array_key_exists('LARAVEL_STORAGE_PATH', $env);
    });
});

test('windows falls back to PATH for kubectl.exe when not present in .larakube/bin', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $oldPath = getenv('PATH');
    $profile = sys_get_temp_dir().'/larakube-win-empty-'.bin2hex(random_bytes(4));
    $pathDir = sys_get_temp_dir().'/larakube-win-path-'.bin2hex(random_bytes(4));
    mkdir($profile, 0777, true);
    mkdir($pathDir, 0777, true);
    file_put_contents($pathDir.'/kubectl.exe', 'fake-kubectl');
    putenv("USERPROFILE={$profile}");
    putenv("PATH={$pathDir}");

    try {
        $locator = new ToolLocator(windows: true, wslFeatureEnabled: false);

        expect($locator->find('kubectl'))->toBe("{$pathDir}/kubectl.exe");
    } finally {
        File::deleteDirectory($profile);
        File::deleteDirectory($pathDir);
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
        $oldPath === false ? putenv('PATH') : putenv("PATH={$oldPath}");
    }
});
