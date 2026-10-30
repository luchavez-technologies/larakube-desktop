<?php

use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;
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

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page
        ->component('readiness')
        ->has('catalog', count(ReadinessCheck::TOOLS))
        ->where('catalog.0.slug', 'larakube')
        ->missing('tools'));
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
