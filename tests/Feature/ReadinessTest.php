<?php

use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;
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
        ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('wsl', null)));
});
