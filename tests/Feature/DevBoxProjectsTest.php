<?php

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\DevBoxShell;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function devBoxProjectsCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function devBoxProjectsExperimental(bool $on): void
{
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturn($on);
    $settings->shouldReceive('get')->andReturn(['cliChannel' => 'canary']);
    app()->instance(GlobalSettings::class, $settings);
}

/** What `new:frameworks --json` sends, trimmed to one framework. */
function devBoxProjectsFrameworks(): void
{
    $name = ['key' => 'name', 'type' => 'text', 'label' => 'App name', 'required' => true, 'arg' => 'positional', 'pattern' => '^[a-z][a-z0-9]*(-[a-z0-9]+)*$', 'maxLength' => 50, 'reserved' => ['console'], 'group' => 'essential'];
    $template = ['key' => 'template', 'type' => 'select', 'label' => 'Template', 'required' => true, 'multiple' => false, 'nullable' => false, 'default' => 'react-ts', 'flag' => '--template=', 'group' => 'essential', 'options' => [['value' => 'react-ts', 'label' => 'React'], ['value' => 'vue-ts', 'label' => 'Vue']]];
    $vite = ['slug' => 'vite', 'label' => 'Vite', 'description' => 'Vite app', 'category' => 'frontend', 'tech' => 'React', 'logo' => 'vite', 'deployable' => true, 'hidden' => false, 'comingSoon' => false, 'command' => 'vite:new', 'args' => ['--fast'], 'fields' => [$name, $template]];

    Process::fake(['*new:frameworks*' => Process::result(output: json_encode(['success' => true, 'categories' => [['id' => 'frontend', 'label' => 'Frontend']], 'frameworks' => [$vite]]))]);
}

function devBoxProjectsStacks(string $status = 'ready'): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'workshop-demo', 'provider' => 'do', 'kind' => 'vps', 'region' => 'sgp1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'role' => 'deploy', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => $status],
    ]]))]);
}

test('the command that runs the CLI on a box goes over SSH with its key, in the projects folder, with every argument quoted', function () {
    $shell = app(DevBoxShell::class);

    $command = $shell->command(['ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox'], ['new', 'my app', '--email=a@b.co; rm -rf /']);

    expect(array_slice($command, 1, 7))->toBe(['-i', '/home/me/.ssh/devbox', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o'])
        ->and($command[count($command) - 2])->toBe('larakube@203.0.113.50')
        ->and($command[count($command) - 1])->toContain('cd "$HOME/projects" && larakube')
        ->toContain("'my app'")
        ->toContain("'--email=a@b.co; rm -rf /'")
        ->toContain("'--no-interaction'");
});

test('a box with no address or key cannot be commanded', function (array $box) {
    expect(fn () => app(DevBoxShell::class)->command($box, ['project:list']))->toThrow(InvalidArgumentException::class);
})->with([
    'no ip' => [['sshKey' => '/k']],
    'not an ip' => [['ip' => 'x; rm', 'sshKey' => '/k']],
    'no key' => [['ip' => '203.0.113.50']],
]);

test('the dev boxes page lists the projects on each box, as the box itself reports them', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxProjectsStacks();
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*project:list*' => Process::result(output: json_encode(['success' => true, 'path' => '/home/larakube/projects', 'projects' => [['name' => 'shop', 'path' => '/home/larakube/projects/shop', 'framework' => 'laravel', 'environments' => [['name' => 'local', 'host' => 'shop.kube']], 'local' => 'running']]])),
    ]);

    $this->get(route('devboxes.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps('projects', fn (AssertableInertia $page) => $page
                ->where('projects.my-dev-box.0.name', 'shop')
                ->where('projects.my-dev-box.0.local', 'running')
            )
        );

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'larakube@203.0.113.50') && str_contains(implode(' ', (array) $process->command), 'project:list'));

    File::deleteDirectory($bin);
});

test('a box that does not answer lists no projects instead of failing the page', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*project:list*' => Process::result(errorOutput: 'ssh: connect to host timed out', exitCode: 255),
    ]);

    $this->get(route('devboxes.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps('projects', fn (AssertableInertia $page) => $page->where('projects.my-dev-box', null))
        );

    File::deleteDirectory($bin);
});

test('creating an app on a dev box runs the framework command there over SSH and registers no folder here', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxProjectsFrameworks();
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);
    $fake = ChildProcess::fake();

    $this->post(route('projects.scaffold-dev-box'), ['framework' => 'vite', 'box' => 'my-dev-box', 'answers' => ['name' => 'blog', 'template' => 'react-ts']])
        ->assertRedirect();

    expect(Run::sole()->kind)->toBe(RunKind::NewDevBoxProject)
        ->and(Run::sole()->meta)->toMatchArray(['server' => 'my-dev-box', 'role' => 'dev', 'app' => 'blog'])
        ->and(Project::count())->toBe(0);

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest): bool {
        $last = end($cmd);

        // The script is quoted once for ssh, so the inner quotes are escaped; undo that to read it.
        $script = str_replace("'\\''", "'", $last);

        return in_array('larakube@203.0.113.50', $cmd, true)
            && str_contains($script, "larakube 'vite:new' 'blog' '--fast' '--template=react-ts' '--no-interaction'");
    });

    File::deleteDirectory($bin);
});

test('an app cannot be created on a box that is unknown, not ready, or when experimental features are off', function (string $box, string $status, bool $experimental, int $expectedStatus) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental($experimental);
    devBoxProjectsFrameworks();
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => $status],
    ]]))]);
    ChildProcess::fake();

    $response = $this->post(route('projects.scaffold-dev-box'), ['framework' => 'vite', 'box' => $box, 'answers' => ['name' => 'blog', 'template' => 'react-ts']]);

    $expectedStatus === 404 ? $response->assertNotFound() : $response->assertSessionHasErrors('box');
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with([
    'an unknown box' => ['nope', 'ready', true, 302],
    'a box that is not ready' => ['my-dev-box', 'incomplete', true, 302],
    'experimental off' => ['my-dev-box', 'ready', false, 404],
]);

test('the New project page offers the ready dev boxes, and none when experimental features are off', function (bool $experimental, array $expected) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental($experimental);
    devBoxProjectsFrameworks();
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ['name' => 'half-made', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.51', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'incomplete'],
    ]]))]);

    $this->get(route('projects.create'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $page) => $page->where('devBoxes', $expected))
        );

    File::deleteDirectory($bin);
})->with([
    'on' => [true, [['name' => 'my-dev-box', 'ip' => '203.0.113.50']]],
    'off' => [false, []],
]);

test('sharing an app starts `share --detach --json` over SSH inside that project\'s folder, and stopping runs `share --stop`', function (string $method, string $route, RunKind $kind, string $expected) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);
    $fake = ChildProcess::fake();

    $this->{$method}(route($route, ['box' => 'my-dev-box', 'project' => 'shop']))->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe($kind);

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest) use ($expected): bool {
        $script = str_replace("'\\''", "'", end($cmd));

        return in_array('larakube@203.0.113.50', $cmd, true)
            && str_contains($script, 'cd "$HOME/projects/shop" && larakube '.$expected);
    });

    File::deleteDirectory($bin);
})->with([
    'share' => ['post', 'devboxes.share', RunKind::ShareDevBoxProject, "'share' '--detach' '--json' '--no-interaction'"],
    'stop' => ['delete', 'devboxes.unshare', RunKind::UnshareDevBoxProject, "'share' '--stop' '--json' '--no-interaction'"],
]);

test('a project name that is not a plain folder name can never reach the box\'s shell', function () {
    devBoxProjectsExperimental(true);

    $this->post('/dev-boxes/my-dev-box/projects/shop;rm/share')->assertNotFound();
    expect(fn () => app(DevBoxShell::class)->command(['ip' => '203.0.113.50', 'sshKey' => '/k'], ['share'], '../etc'))->toThrow(InvalidArgumentException::class);
});

test('sharing needs a ready dev box and experimental features on', function (bool $experimental, string $status) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental($experimental);
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => $status],
    ]]))]);
    ChildProcess::fake();

    $this->post(route('devboxes.share', ['box' => 'my-dev-box', 'project' => 'shop']))->assertNotFound();
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with([
    'off' => [false, 'ready'],
    'not ready' => [true, 'incomplete'],
]);

test('updating the CLI on a box runs the installer there on the channel Desktop uses, and nothing else', function (string $channel, string $installer) {
    $bin = devBoxProjectsCli();
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnTrue();
    $settings->shouldReceive('get')->andReturn(['cliChannel' => $channel]);
    app()->instance(GlobalSettings::class, $settings);
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.update-cli', ['box' => 'my-dev-box']))->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::UpdateDevBoxCli);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('larakube@203.0.113.50', $cmd, true)
        && str_contains(end($cmd), $installer)
        && str_contains(str_replace("'\\''", "'", end($cmd)), "printf '%s\\n' 'my-dev-box' > \"\$HOME/.larakube/devbox\"")
        && ! str_contains(end($cmd), 'cd "$HOME/projects"'));

    File::deleteDirectory($bin);
})->with([
    'canary' => ['canary', 'curl -fsSL https://cli.larakube.app/install.sh | bash -s -- --canary'],
    'stable' => ['stable', 'curl -fsSL https://cli.larakube.app/install.sh | bash &&'],
]);

test('the CLI on a box can only be updated on a ready dev box with experimental features on', function (bool $experimental, string $status) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental($experimental);
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => $status],
    ]]))]);
    ChildProcess::fake();

    $this->post(route('devboxes.update-cli', ['box' => 'my-dev-box']))->assertNotFound();
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with([
    'off' => [false, 'ready'],
    'not ready' => [true, 'incomplete'],
]);
