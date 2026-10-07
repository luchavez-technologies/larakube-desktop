<?php

use App\Models\Project;
use App\Services\EditorLauncher;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;

/**
 * A fake HOME with an Applications folder holding the given editor apps and
 * a bin folder holding the given editor launchers.
 *
 * @param  list<string>  $apps
 * @param  list<string>  $clis
 * @return array{home: string, applications: string, bin: string, app: string}
 */
function editorSandbox(array $apps = [], array $clis = []): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $applications = "{$home}/Applications";
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists("{$home}/code/shop");

    foreach ($apps as $app) {
        File::ensureDirectoryExists("{$applications}/{$app}.app");
    }

    foreach ($clis as $cli) {
        File::put("{$bin}/{$cli}", "#!/bin/sh\n");
        chmod("{$bin}/{$cli}", 0755);
    }

    $_SERVER['HOME'] = realpath($home);
    $locator = new ToolLocator([$bin]);
    app()->instance(ToolLocator::class, $locator);
    app()->instance(EditorLauncher::class, new EditorLauncher($locator, [$applications]));

    return ['home' => realpath($home), 'applications' => realpath($applications) ?: $applications, 'bin' => $bin, 'app' => realpath("{$home}/code/shop")];
}

test('only editors installed as an app or a launcher are offered', function () {
    $sandbox = editorSandbox(apps: ['Visual Studio Code', 'PhpStorm'], clis: ['zed']);

    expect(app(EditorLauncher::class)->available())->toBe([
        ['slug' => 'vscode', 'label' => 'VS Code'],
        ['slug' => 'phpstorm', 'label' => 'PhpStorm'],
        ['slug' => 'zed', 'label' => 'Zed'],
    ]);

    File::deleteDirectory($sandbox['home']);
});

test('an app opens with open -a, and a launcher-only editor with its own command', function () {
    $sandbox = editorSandbox(apps: ['PhpStorm'], clis: ['zed']);
    Process::fake();
    $project = Project::create(['path' => $sandbox['app']]);

    $this->post(route('projects.editor', $project), ['editor' => 'phpstorm'])->assertSessionHasNoErrors();
    $this->post(route('projects.editor', $project), ['editor' => 'zed'])->assertSessionHasNoErrors();

    Process::assertRan(fn ($process): bool => $process->command === ['open', '-a', "{$sandbox['applications']}/PhpStorm.app", $sandbox['app']]);
    Process::assertRan(fn ($process): bool => $process->command === ["{$sandbox['bin']}/zed", $sandbox['app']]);

    File::deleteDirectory($sandbox['home']);
});

test('a missing editor or an unknown one is refused', function () {
    $sandbox = editorSandbox();
    Process::fake();
    $project = Project::create(['path' => $sandbox['app']]);

    $this->post(route('projects.editor', $project), ['editor' => 'vscode'])->assertSessionHasErrors('editor');
    $this->post(route('projects.editor', $project), ['editor' => 'notepad'])->assertSessionHasErrors('editor');

    Process::assertNothingRan();

    File::deleteDirectory($sandbox['home']);
});

test('the project page lists the installed editors', function () {
    $sandbox = editorSandbox(apps: ['Zed']);
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => []]))]);
    $project = Project::create(['path' => $sandbox['app']]);

    $this->get(route('projects.show', $project))
        ->assertInertia(fn (AssertableInertia $page) => $page->where('editors', [['slug' => 'zed', 'label' => 'Zed']]));

    File::deleteDirectory($sandbox['home']);
});

test('appropriate specialized editors are prioritized and non-matching specialized ones are filtered for a framework', function () {
    $sandbox = editorSandbox(apps: ['Visual Studio Code', 'PhpStorm', 'PyCharm'], clis: ['zed']);
    $launcher = app(EditorLauncher::class);

    // For Laravel (PHP): PhpStorm is prioritized at the top, PyCharm is filtered out
    expect($launcher->available('laravel'))->toBe([
        ['slug' => 'phpstorm', 'label' => 'PhpStorm'],
        ['slug' => 'vscode', 'label' => 'VS Code'],
        ['slug' => 'zed', 'label' => 'Zed'],
    ]);

    // For FastAPI / Django (Python): PyCharm is prioritized at the top, PhpStorm is filtered out
    expect($launcher->available('fastapi'))->toBe([
        ['slug' => 'pycharm', 'label' => 'PyCharm'],
        ['slug' => 'vscode', 'label' => 'VS Code'],
        ['slug' => 'zed', 'label' => 'Zed'],
    ]);

    expect($launcher->available('django'))->toBe([
        ['slug' => 'pycharm', 'label' => 'PyCharm'],
        ['slug' => 'vscode', 'label' => 'VS Code'],
        ['slug' => 'zed', 'label' => 'Zed'],
    ]);

    // For Next.js (JS): specialized PHP/Python IDEs are filtered out, universal editors remain
    expect($launcher->available('nextjs'))->toBe([
        ['slug' => 'vscode', 'label' => 'VS Code'],
        ['slug' => 'zed', 'label' => 'Zed'],
    ]);

    File::deleteDirectory($sandbox['home']);
});

test('community editions and alternative app names like PyCharm CE and IntelliJ IDEA CE are detected', function () {
    $sandbox = editorSandbox(apps: ['PyCharm CE', 'IntelliJ IDEA CE']);
    $launcher = app(EditorLauncher::class);

    expect($launcher->available('fastapi'))->toBe([
        ['slug' => 'pycharm', 'label' => 'PyCharm'],
    ]);

    expect($launcher->available('springboot'))->toBe([
        ['slug' => 'idea', 'label' => 'IntelliJ IDEA'],
    ]);

    File::deleteDirectory($sandbox['home']);
});
