<?php

use App\Contracts\CliToolContract;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;
use App\Services\LaraKube\Tools\CliToolRegistry;
use App\Services\LaraKube\Tools\LaraKubeWslCliTool;
use App\Services\LaraKube\Tools\PodmanTool;
use App\Services\Wsl;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;

/**
 * A throwaway bin directory holding empty executables named $binaries,
 * bound as the only place ToolLocator looks.
 *
 * @param  list<string>  $binaries
 */
function readinessFakeBinDirectory(array $binaries): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);

    foreach ($binaries as $binary) {
        File::put("{$directory}/{$binary}", "#!/bin/sh\n");
        chmod("{$directory}/{$binary}", 0755);
    }

    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('each tool answers for itself, with its version, or as missing', function () {
    $bin = readinessFakeBinDirectory(['larakube', 'kubectl']);
    Cache::flush();
    Process::fake([
        '*larakube*--version*' => Process::result(output: "LaraKube CLI v0.40.0\n"),
        '*kubectl*version*--client*' => Process::result(output: "Client Version: v1.34.1\nKustomize Version: v5.7.1\n"),
    ]);

    $this->getJson(route('setup.tools.status', 'larakube'))
        ->assertOk()
        ->assertJson(['installed' => true, 'version' => 'LaraKube CLI v0.40.0']);
    $this->getJson(route('setup.tools.status', 'kubectl'))->assertJson(['installed' => true, 'version' => 'Client Version: v1.34.1']);
    $this->getJson(route('setup.tools.status', 'tofu'))->assertJson(['installed' => false, 'version' => null]);
    $this->getJson(route('setup.tools.status', 'nonsense'))->assertNotFound();

    File::deleteDirectory($bin);
});

test('a tool is not checked again until asked to, or until an install ends', function () {
    $bin = readinessFakeBinDirectory(['larakube']);
    Cache::flush();
    Process::fake(['*larakube*--version*' => Process::result(output: "v1\n")]);

    $this->getJson(route('setup.tools.status', 'larakube'));
    $this->getJson(route('setup.tools.status', 'larakube'));
    Process::assertRanTimes(fn ($process) => in_array('--version', (array) $process->command, true), 1);

    $this->getJson(route('setup.tools.status', ['tool' => 'larakube', 'fresh' => 1]));
    Process::assertRanTimes(fn ($process) => in_array('--version', (array) $process->command, true), 2);

    File::deleteDirectory($bin);
});

test('a tool that is installed but whose --version check fails reports the real reason, not the install path as a fake version', function () {
    // Confirmed live (2026-10-30): a correctly-installed larakube.exe whose
    // --version check failed for some reason had its install PATH shown in
    // the version slot instead — read as a garbled/corrupted install. The
    // backend must never let the frontend confuse "installed" with "version
    // known"; a failed version check should say why, not go silent.
    $bin = readinessFakeBinDirectory(['larakube']);
    Cache::flush();
    Process::fake([
        '*larakube*--version*' => Process::result(errorOutput: 'something went wrong', exitCode: 1),
    ]);

    $this->getJson(route('setup.tools.status', 'larakube'))
        ->assertOk()
        ->assertJson(['installed' => true, 'version' => null])
        ->assertJsonFragment(['diagnostic' => 'Exit 1: something went wrong']);

    File::deleteDirectory($bin);
});

test('providers are null when the CLI is too old to know cloud:providers', function () {
    $bin = readinessFakeBinDirectory(['larakube']);
    Process::fake([
        '*cloud:providers*' => Process::result(errorOutput: 'Command "cloud:providers" is not defined.', exitCode: 1),
        '*' => Process::result(output: 'v1'),
    ]);

    $this->get(route('readiness'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('providers', null)));

    File::deleteDirectory($bin);
});

test('where a provider\'s prices come from is passed through, so the form can say so', function () {
    $bin = readinessFakeBinDirectory(['larakube']);
    Process::fake([
        '*cloud:providers*' => Process::result(output: json_encode(['success' => true, 'providers' => [
            ['slug' => 'do', 'label' => 'DigitalOcean', 'pricing' => ['source' => 'live', 'asOf' => '2026-10-04T01:00:00+00:00', 'currency' => 'USD']],
            ['slug' => 'aws', 'label' => 'Amazon Web Services', 'pricing' => ['source' => 'builtin', 'asOf' => null, 'currency' => null]],
        ]])),
        '*' => Process::result(output: 'v1'),
    ]);

    $this->get(route('readiness'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('providers.0.pricing.source', 'live')
                ->where('providers.1.pricing.source', 'builtin')));

    File::deleteDirectory($bin);
});

test('providers are cached so subsequent calls do not rerun the CLI command', function () {
    $bin = readinessFakeBinDirectory(['larakube']);
    Cache::flush();
    Process::fake([
        '*cloud:providers*' => Process::result(output: json_encode(['success' => true, 'providers' => [
            ['slug' => 'do', 'label' => 'DigitalOcean'],
        ]])),
        '*' => Process::result(output: 'v1'),
    ]);

    $check = app(ReadinessCheck::class);
    $first = $check->providers();
    $second = $check->providers();

    expect($first)->toHaveCount(1)
        ->and($second)->toHaveCount(1);

    Process::assertRanTimes(fn ($process) => in_array('cloud:providers', (array) $process->command, true), 1);

    $check->forget();
    $third = $check->providers();
    expect($third)->toHaveCount(1);
    Process::assertRanTimes(fn ($process) => in_array('cloud:providers', (array) $process->command, true), 2);

    File::deleteDirectory($bin);
});

test('providers can be requested with statusOnly flag', function () {
    $bin = readinessFakeBinDirectory(['larakube']);
    Cache::flush();
    Process::fake([
        '*cloud:providers*' => Process::result(output: json_encode(['success' => true, 'providers' => [
            ['slug' => 'do', 'label' => 'DigitalOcean', 'credentials' => ['ready' => true, 'hint' => null]],
        ]])),
        '*' => Process::result(output: 'v1'),
    ]);

    $check = app(ReadinessCheck::class);
    $providers = $check->providers(statusOnly: true);

    expect($providers)->toHaveCount(1)
        ->and($providers[0]['slug'])->toBe('do');

    Process::assertRan(fn ($process) => in_array('--status-only', (array) $process->command, true));

    File::deleteDirectory($bin);
});

test('the usage choice is saved and offered back to the Setup page', function () {
    readinessFakeBinDirectory(['larakube']);
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);
    Process::fake(['*' => Process::result(output: '')]);

    $this->post(route('setup.usage'), ['usage' => 'apps'])->assertRedirect();
    $this->post(route('setup.usage'), ['usage' => 'nonsense'])->assertSessionHasErrors('usage');

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page->where('usage', 'apps'));
});

test('the Setup page lists every tool at once, before any check has run', function () {
    readinessFakeBinDirectory(['larakube']);
    Process::fake(['*' => Process::result(output: '')]);
    $expectedCount = count(ReadinessCheck::TOOLS) - (PHP_OS_FAMILY === 'Windows' ? 0 : 1);

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page
        ->component('readiness')
        ->has('catalog', $expectedCount)
        ->where('catalog.0.slug', 'larakube')
        ->missing('tools'));
});

test('an explicit "Check again" bypasses the local-cluster cache, so a cluster fixed since the last check shows up immediately', function () {
    // Confirmed live: the "Check again" button reloaded 'wsl' and 'providers'
    // but never 'localCluster', and even once added, LocalCluster::detect()
    // without fresh=true still served its own 30s cache — so a user who just
    // installed Traefik on an already-running OrbStack kept seeing the stale
    // "not set up yet" verdict no matter how many times they clicked it.
    readinessFakeBinDirectory(['larakube', 'kubectl']);
    Cache::flush();
    Cache::put(LocalCluster::CACHE_KEY, [
        'engine' => 'OrbStack',
        'context' => 'orbstack',
        'status' => 'OrbStack is running — LaraKube is not set up on it yet',
        'tone' => 'warn',
    ], 30);

    // A plain reload (no fresh flag) still serves the cached verdict.
    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
            ->where('localCluster.tone', 'warn')));

    // fresh=1, exactly what the "Check again" button now sends, forces a
    // real recheck instead — here kubectl finds no cluster at all, proving
    // the cached 'warn' verdict above was genuinely bypassed, not reused.
    Process::fake(['*' => Process::result(output: '', exitCode: 1)]);

    $this->get(route('readiness', ['fresh' => 1]))->assertInertia(fn (AssertableInertia $page) => $page
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
            ->where('localCluster.tone', 'muted')));
});

test('only a Windows computer is asked about WSL', function () {
    readinessFakeBinDirectory(['larakube']);
    Process::fake(['*' => Process::result(output: '')]);

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page
        ->where('windows', PHP_OS_FAMILY === 'Windows')
        ->has('terminalConfigured')
        ->has('shellProfile')
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('wsl', null)));
});

test('a "tools"-only Windows user never triggers wsl.exe at all, not even a --status probe', function () {
    // Confirmed live (2026-10-26): wsl.exe --status alone pops Windows's own
    // native "WSL is not installed, press any key to install" prompt when
    // the feature isn't present — so for usage === 'tools' the deferred
    // prop must resolve to null WITHOUT ever invoking wsl.exe, not just
    // without rendering the in-app WslCheck wizard.
    readinessFakeBinDirectory(['larakube']);
    app(GlobalSettings::class)->update(['usage' => 'tools']);
    app()->instance(Wsl::class, new Wsl(windows: true));

    Process::fake(['*' => Process::result(output: '')]);

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page
        ->where('windows', true)
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('wsl', null)));

    Process::assertNotRan(fn ($process) => in_array('wsl.exe', (array) $process->command, true));
});

test('an "apps" Windows user does get checked for WSL, since local k3s development still needs it', function () {
    readinessFakeBinDirectory(['larakube']);
    app(GlobalSettings::class)->update(['usage' => 'apps']);
    app()->instance(Wsl::class, new Wsl(windows: true, featureEnabled: true));

    Process::fake([
        '*--status*' => Process::result(output: "Default Version: 2\n"),
        '*' => Process::result(exitCode: 1),
    ]);

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page
        ->where('windows', true)
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->has('wsl')));

    Process::assertRan(fn ($process) => in_array('wsl.exe', (array) $process->command, true));
});

test('catalog includes gh and tea tools as local-only developer tools', function () {
    $check = app(ReadinessCheck::class);
    $catalog = collect($check->catalog())->keyBy('slug');

    expect($catalog)->toHaveKeys(['gh', 'tea'])
        ->and($catalog['gh']['localOnly'])->toBeTrue()
        ->and($catalog['tea']['localOnly'])->toBeTrue();
});

test('ToolLocator prefers the newer larakube binary when multiple directories contain it', function () {
    $dirOld = storage_path('framework/testing/bin-old-'.bin2hex(random_bytes(4)));
    $dirNew = storage_path('framework/testing/bin-new-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($dirOld);
    File::ensureDirectoryExists($dirNew);

    File::put("{$dirOld}/larakube", "#!/bin/sh\n");
    chmod("{$dirOld}/larakube", 0755);
    touch("{$dirOld}/larakube", time() - 3600);

    File::put("{$dirNew}/larakube", "#!/bin/sh\n");
    chmod("{$dirNew}/larakube", 0755);
    touch("{$dirNew}/larakube", time());

    $locator = new ToolLocator([$dirOld, $dirNew], windows: false);
    expect($locator->find('larakube'))->toBe("{$dirNew}/larakube");

    File::deleteDirectory($dirOld);
    File::deleteDirectory($dirNew);
});

test('the manual install command is a PowerShell one-liner on Windows, not the Ubuntu bash command', function () {
    // Confirmed live (2026-10-30): a Windows user on the CLI-missing screen
    // was shown `curl -fsSL ... | bash -s -- --canary` verbatim — meaningless
    // without curl/bash, and the wrong install mechanism entirely.
    $posix = new ReadinessCheck(new ToolLocator(windows: false));
    $windows = new ReadinessCheck(new ToolLocator(windows: true));

    expect($posix->cliInstallCommand())->toContain('bash')->toContain('install.sh')
        ->and($windows->cliInstallCommand())->toContain('irm')->toContain('install.ps1')
        ->and($windows->cliInstallCommand())->not->toContain('bash');
});

test('a failed version check is not cached for 5 minutes so the next check can recover', function () {
    $bin = readinessFakeBinDirectory(['larakube']);
    Cache::flush();

    Process::fake([
        '*larakube*--version*' => Process::sequence()
            ->push(Process::result(errorOutput: 'timed out', exitCode: 1))
            ->push(Process::result(output: "LaraKube  v0.42.0\n")),
    ]);

    $this->getJson(route('setup.tools.status', 'larakube'))
        ->assertOk()
        ->assertJson(['installed' => true, 'version' => null]);

    $this->getJson(route('setup.tools.status', 'larakube'))
        ->assertOk()
        ->assertJson(['installed' => true, 'version' => 'LaraKube v0.42.0']);

    File::deleteDirectory($bin);
});

test('on Windows with larakube-ubuntu installed, status(larakube) and shared versions include both host and WSL CLI versions', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $profile = sys_get_temp_dir().'/larakube-win-dual-'.bin2hex(random_bytes(4));
    mkdir($profile.'/.larakube/bin', 0777, true);
    file_put_contents($profile.'/.larakube/bin/larakube.exe', 'fake-exe');
    putenv("USERPROFILE={$profile}");
    Cache::flush();

    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: true));

    Process::fake([
        '*--list*--verbose*' => Process::result(output: "  NAME            STATE           VERSION\n* larakube-ubuntu Running         2\n"),
        '*which*larakube*' => Process::result(output: "/usr/local/bin/larakube\n"),
        '*wsl.exe*--version*' => Process::result(output: "LaraKube v0.41.0\n"),
        '*larakube.exe*--version*' => Process::result(output: "LaraKube v0.42.0\n"),
        '*' => Process::result(exitCode: 1),
    ]);

    try {
        $this->getJson(route('setup.tools.status', 'larakube'))
            ->assertOk()
            ->assertJson([
                'installed' => true,
                'version' => 'LaraKube v0.42.0',
                'wsl' => [
                    'installed' => true,
                    'path' => '/usr/local/bin/larakube',
                    'version' => 'LaraKube v0.41.0',
                ],
            ]);

        $this->get(route('readiness'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('versions.cli', 'v0.42.0')
                ->where('versions.wslCli', 'v0.41.0')
                ->where('versions.hasWslCli', true));
    } finally {
        File::deleteDirectory($profile);
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
    }
});

test('on Windows without WSL enabled, status(larakube) omits wsl and never invokes wsl.exe', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $profile = sys_get_temp_dir().'/larakube-win-nowsl-'.bin2hex(random_bytes(4));
    mkdir($profile.'/.larakube/bin', 0777, true);
    file_put_contents($profile.'/.larakube/bin/larakube.exe', 'fake-exe');
    putenv("USERPROFILE={$profile}");
    Cache::flush();

    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: false));

    Process::fake([
        '*larakube.exe*--version*' => Process::result(output: "LaraKube v0.42.0\n"),
    ]);

    try {
        $response = $this->getJson(route('setup.tools.status', 'larakube'))
            ->assertOk()
            ->assertJson(['installed' => true, 'version' => 'LaraKube v0.42.0'])
            ->json();

        expect($response)->not->toHaveKey('wsl');
        Process::assertNotRan(fn ($process) => str_contains(implode(' ', (array) $process->command), 'wsl.exe'));
    } finally {
        File::deleteDirectory($profile);
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
    }
});

test('on Windows with WSL enabled for another distro (no larakube-ubuntu), status(larakube) omits wsl cleanly', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $profile = sys_get_temp_dir().'/larakube-win-otherdistro-'.bin2hex(random_bytes(4));
    mkdir($profile.'/.larakube/bin', 0777, true);
    file_put_contents($profile.'/.larakube/bin/larakube.exe', 'fake-exe');
    putenv("USERPROFILE={$profile}");
    Cache::flush();

    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: true));

    Process::fake([
        '*--list*--verbose*' => Process::result(output: "  NAME            STATE           VERSION\n* docker-desktop  Running         2\n"),
        '*larakube.exe*--version*' => Process::result(output: "LaraKube v0.42.0\n"),
    ]);

    try {
        $response = $this->getJson(route('setup.tools.status', 'larakube'))
            ->assertOk()
            ->assertJson(['installed' => true, 'version' => 'LaraKube v0.42.0'])
            ->json();

        expect($response)->not->toHaveKey('wsl');
        Process::assertNotRan(fn ($process) => in_array('larakube-ubuntu', (array) $process->command, true));
    } finally {
        File::deleteDirectory($profile);
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
    }
});

test('status ignores a stale cached installed entry when the cached binary no longer exists on disk', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $profile = sys_get_temp_dir().'/larakube-win-stale-'.bin2hex(random_bytes(4));
    mkdir($profile.'/.larakube/bin', 0777, true);
    $binaryPath = $profile.'/.larakube/bin/larakube.exe';
    file_put_contents($binaryPath, 'fake-exe');
    putenv("USERPROFILE={$profile}");
    Cache::flush();

    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: false));
    Process::fake([
        '*larakube.exe*--version*' => Process::result(output: "LaraKube v0.42.0\n"),
    ]);

    try {
        $check = app(ReadinessCheck::class);
        expect($check->status('larakube')['installed'])->toBeTrue();

        @unlink($binaryPath);

        $afterDelete = $check->status('larakube');
        expect($afterDelete['installed'])->toBeFalse()
            ->and($afterDelete['path'])->toBeNull();
    } finally {
        File::deleteDirectory($profile);
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
    }
});

test('non-Windows catalog omits larakube-wsl and leaves environment null for every tool', function () {
    $check = new ReadinessCheck(new ToolLocator(windows: false));
    $catalog = collect($check->catalog())->keyBy('slug');

    expect($catalog)->not->toHaveKey('larakube-wsl')
        ->and($catalog->every(fn (array $tool): bool => $tool['environment'] === null))->toBeTrue();
});

test('Windows catalog includes larakube-wsl and tags every tool as windows or wsl', function () {
    $check = new ReadinessCheck(new ToolLocator(windows: true));
    $catalog = collect($check->catalog())->keyBy('slug');

    expect($catalog)->toHaveKey('larakube-wsl')
        ->and($catalog['larakube-wsl']['localOnly'])->toBeTrue()
        ->and($catalog['larakube-wsl']['environment'])->toBe('wsl');

    foreach (['larakube', 'kubectl', 'k9s', 'tofu', 'ssh', 'aws', 'gcloud'] as $windowsSlug) {
        expect($catalog[$windowsSlug]['environment'])->toBe('windows');
    }

    foreach (['larakube-wsl', 'gh', 'tea', 'git', 'docker', 'podman', 'dnsmasq'] as $wslSlug) {
        expect($catalog[$wslSlug]['environment'])->toBe('wsl');
    }
});

test('GET setup/tools/larakube-wsl/status returns the WSL CLI status independently on Windows', function () {
    Cache::flush();
    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: true));

    Process::fake([
        '*--list*--verbose*' => Process::result(output: "  NAME            STATE           VERSION\n* larakube-ubuntu Running         2\n"),
        '*which*larakube*' => Process::result(output: "/usr/local/bin/larakube\n"),
        '*wsl.exe*--version*' => Process::result(output: "LaraKube v0.41.0\n"),
        '*' => Process::result(exitCode: 1),
    ]);

    $this->getJson(route('setup.tools.status', 'larakube-wsl'))
        ->assertOk()
        ->assertJson([
            'installed' => true,
            'path' => '/usr/local/bin/larakube',
            'version' => 'LaraKube v0.41.0',
        ]);
});

test('GET setup/tools/larakube-wsl/status returns installed false cleanly when WSL distro is missing', function () {
    Cache::flush();
    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: false));

    $this->getJson(route('setup.tools.status', 'larakube-wsl'))
        ->assertOk()
        ->assertJson([
            'installed' => false,
            'path' => null,
            'version' => null,
        ]);
});

test('on Windows when larakube.exe is missing, status(larakube) returns missing without falling back to WSL diagnostics', function () {
    $oldUserProfile = getenv('USERPROFILE');
    $profile = sys_get_temp_dir().'/larakube-win-missing-'.bin2hex(random_bytes(4));
    mkdir($profile.'/.larakube/bin', 0777, true);
    putenv("USERPROFILE={$profile}");
    Cache::flush();

    app()->instance(ToolLocator::class, new ToolLocator(windows: true, wslFeatureEnabled: false));
    Process::fake();

    try {
        $this->getJson(route('setup.tools.status', 'larakube'))
            ->assertOk()
            ->assertJson([
                'installed' => false,
                'path' => null,
                'version' => null,
                'diagnostic' => null,
            ]);

        Process::assertNothingRan();
    } finally {
        File::deleteDirectory($profile);
        $oldUserProfile === false ? putenv('USERPROFILE') : putenv("USERPROFILE={$oldUserProfile}");
    }
});

test('CliToolRegistry resolves per-tool services and drives the ReadinessCheck catalog', function () {
    $registry = app(CliToolRegistry::class);

    expect($registry->all())->toHaveCount(count(ReadinessCheck::TOOLS))
        ->and($registry->find('larakube'))->toBeInstanceOf(CliToolContract::class)
        ->and($registry->find('larakube-wsl'))->toBeInstanceOf(LaraKubeWslCliTool::class)
        ->and($registry->find('podman'))->toBeInstanceOf(PodmanTool::class);
});
