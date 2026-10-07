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

test('a dev box page lists its projects, as the box itself reports them', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxProjectsStacks();
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/home/me/.ssh/devbox', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*project:list*' => Process::result(output: json_encode(['success' => true, 'path' => '/home/larakube/projects', 'projects' => [['name' => 'shop', 'path' => '/home/larakube/projects/shop', 'framework' => 'laravel', 'environments' => [['name' => 'local', 'host' => 'shop.kube']], 'local' => 'running']]])),
    ]);

    $this->get(route('devboxes.show', ['box' => 'my-dev-box']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('devboxes/show')
            ->where('box.name', 'my-dev-box')
            ->loadDeferredProps('projects', fn (AssertableInertia $page) => $page
                ->where('projects.0.name', 'shop')
                ->where('projects.0.local', 'running')
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

    $this->get(route('devboxes.show', ['box' => 'my-dev-box']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps('projects', fn (AssertableInertia $page) => $page->where('projects', null))
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

test('a project name that is not a plain folder name can never reach the box\'s shell', function () {
    devBoxProjectsExperimental(true);

    $this->post('/dev-boxes/my-dev-box/projects/shop;rm/up')->assertNotFound();
    expect(fn () => app(DevBoxShell::class)->command(['ip' => '203.0.113.50', 'sshKey' => '/k'], ['share'], '../etc'))->toThrow(InvalidArgumentException::class);
});

test('sharing under a domain needs a ready dev box and experimental features on', function (bool $experimental, string $status) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental($experimental);
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => $status],
    ]]))]);
    ChildProcess::fake();

    $this->post(route('devboxes.share-domain', ['box' => 'my-dev-box', 'project' => 'shop']), ['token' => 'abc', 'domain' => 'example.com'])->assertNotFound();
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

test('updating the CLI on a box via Inertia returns back to stay on the dev box page', function () {
    $bin = devBoxProjectsCli();
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnTrue();
    $settings->shouldReceive('get')->andReturn(['cliChannel' => 'stable']);
    app()->instance(GlobalSettings::class, $settings);
    devBoxProjectsStacks();
    ChildProcess::fake();

    $this->from(route('devboxes.show', 'my-dev-box'))
        ->withHeader('X-Inertia', 'true')
        ->post(route('devboxes.update-cli', ['box' => 'my-dev-box']))
        ->assertRedirect(route('devboxes.show', 'my-dev-box'));

    expect(Run::sole()->kind)->toBe(RunKind::UpdateDevBoxCli);

    File::deleteDirectory($bin);
});

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

function devBoxDomainStacks(): void
{
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*share:domains*' => Process::result(output: json_encode(['success' => true, 'domains' => ['example.com', 'other.dev']])),
    ]);
}

test('sharing under a domain sends the Cloudflare token to the box on standard input, never in a command line', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.share-domain', ['box' => 'my-dev-box', 'project' => 'shop']), ['token' => 'cf_Secret-token_123', 'domain' => 'example.com'])
        ->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::ShareDomainDevBoxProject)
        ->and(json_encode(Run::sole()->command))->not->toContain('cf_Secret-token_123');

    $fake->assertStarted(function (array|string $cmd, mixed ...$rest): bool {
        $joined = implode(' ', (array) $cmd);
        $script = str_replace("'\\''", "'", end($cmd));

        return ! str_contains($joined, 'cf_Secret-token_123')
            && str_contains($joined, 'printf')
            && str_contains($script, 'IFS= read -r CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN')
            && str_contains($script, 'cd "$HOME/projects/shop" && larakube \'share\' \'--domain=example.com\' \'--box=my-dev-box\' \'--json\' \'--no-interaction\'');
    });

    File::deleteDirectory($bin);
});

test('removing the public names runs share:remove on the box with the token on standard input', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->delete(route('devboxes.remove-domain', ['box' => 'my-dev-box', 'project' => 'shop']), ['token' => 'cf_Secret-token_123'])
        ->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::RemoveDomainDevBoxProject);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => str_contains(str_replace("'\\''", "'", end($cmd)), "larakube 'share:remove' '--force' '--json'"));

    File::deleteDirectory($bin);
});

test('finding the domains asks the box with the token on standard input and returns the names', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();

    $this->postJson(route('devboxes.domains', ['box' => 'my-dev-box']), ['token' => 'cf_Secret-token_123'])
        ->assertOk()
        ->assertExactJson(['domains' => ['example.com', 'other.dev']]);

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'share:domains')
        && ! str_contains(implode(' ', (array) $process->command), 'cf_Secret-token_123')
        && $process->input === "cf_Secret-token_123\n");

    File::deleteDirectory($bin);
});

test('a token or domain that could carry shell syntax is refused', function (string $field, string $value) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    ChildProcess::fake();

    $data = ['token' => 'abc', 'domain' => 'example.com', $field => $value];
    $this->post(route('devboxes.share-domain', ['box' => 'my-dev-box', 'project' => 'shop']), $data)->assertSessionHasErrors($field);
    expect(Run::count())->toBe(0);

    File::deleteDirectory($bin);
})->with([
    'token' => ['token', 'abc; rm -rf /'],
    'domain' => ['domain', 'example.com; reboot'],
]);

test('the domain pages are not there with experimental features off', function () {
    devBoxProjectsExperimental(false);

    $this->get(route('devboxes.share-domain-page', ['box' => 'my-dev-box', 'project' => 'shop']))->assertNotFound();
    $this->postJson(route('devboxes.domains', ['box' => 'my-dev-box']), ['token' => 'abc'])->assertNotFound();
});

test('a dev box page opens the tunnel through the CLI and reads Plex Commons through the kube-context it made', function () {
    $bin = devBoxProjectsCli();
    File::put("{$bin}/kubectl", "#!/bin/sh\n");
    chmod("{$bin}/kubectl", 0755);
    devBoxProjectsExperimental(true);
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*devbox:connect*' => Process::result(output: json_encode(['success' => true, 'context' => 'larakube-devbox-my-dev-box', 'port' => 16443])),
        '*plex-commons*' => Process::result(output: json_encode(['services' => ['postgres' => ['host' => 'postgres.larakube-plex']]])),
        '*plex-registry*' => Process::result(output: json_encode(['tenants' => ['shop' => ['redis_index' => 1]]])),
    ]);

    $this->get(route('devboxes.show', ['box' => 'my-dev-box']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps('cluster', fn (AssertableInertia $page) => $page
                ->where('cluster.context', 'larakube-devbox-my-dev-box')
                ->where('cluster.plex.initialized', true)
            )
        );

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'devbox:connect')
        && str_contains(implode(' ', (array) $process->command), '--stack-name=my-dev-box'));

    File::deleteDirectory($bin);
});

test('a dev box page whose tunnel cannot be opened says so instead of failing', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*devbox:connect*' => Process::result(output: json_encode(['success' => false, 'error' => 'no tunnel']), exitCode: 1),
    ]);

    $this->get(route('devboxes.show', ['box' => 'my-dev-box']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps('cluster', fn (AssertableInertia $page) => $page->where('cluster.context', null)->where('cluster.plex', null))
        );

    File::deleteDirectory($bin);
});

test('only a dev box has a dev box page', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsStacks();
    devBoxProjectsExperimental(true);

    $this->get(route('devboxes.show', ['box' => 'workshop-demo']))->assertNotFound();
    $this->get(route('devboxes.show', ['box' => 'nope']))->assertNotFound();

    File::deleteDirectory($bin);
});

test('the dev box page is off with experimental features off', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsStacks();
    devBoxProjectsExperimental(false);

    $this->get(route('devboxes.show', ['box' => 'my-dev-box']))->assertNotFound();

    File::deleteDirectory($bin);
});

test('the projects page offers a switch to each dev box, and lists the chosen box\'s apps as the box reports them', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*project:list*' => Process::result(output: json_encode(['success' => true, 'path' => '/home/larakube/projects', 'projects' => [['name' => 'shop', 'path' => '/home/larakube/projects/shop', 'framework' => 'laravel', 'environments' => [['name' => 'local', 'host' => 'shop.kube']], 'local' => 'stopped']]])),
    ]);

    $this->get(route('projects.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('box', null)
            ->loadDeferredProps('devBoxes', fn (AssertableInertia $page) => $page->where('devBoxes', ['my-dev-box']))
        );

    $this->get(route('projects.index', ['box' => 'my-dev-box']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('box', 'my-dev-box')
            ->loadDeferredProps('boxProjects', fn (AssertableInertia $page) => $page
                ->has('boxProjects', 1)
                ->where('boxProjects.0.name', 'shop')
            )
        );

    File::deleteDirectory($bin);
});

test('a box name that is not a plain name is ignored on the projects page', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    Process::fake();

    $this->get(route('projects.index', ['box' => 'x;reboot']))->assertInertia(fn (AssertableInertia $page) => $page->where('box', null));

    File::deleteDirectory($bin);
});

test('the projects page has no dev box switch with experimental features off', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(false);
    Process::fake();

    $this->get(route('projects.index', ['box' => 'my-dev-box']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('box', null)
            ->loadDeferredProps('devBoxes', fn (AssertableInertia $page) => $page->where('devBoxes', []))
        );

    File::deleteDirectory($bin);
});

test('up, start, stop and down of an app on a box run that command there, in the app\'s folder', function (string $action, string $expected) {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.operate', ['box' => 'my-dev-box', 'project' => 'shop', 'action' => $action]))
        ->assertRedirect(route('runs.show', Run::sole()));

    expect(Run::sole()->kind)->toBe(RunKind::OperateDevBoxProject);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => str_contains(str_replace("'\\''", "'", end($cmd)), 'cd "$HOME/projects/shop" && larakube '.$expected));

    File::deleteDirectory($bin);
})->with([
    'up' => ['up', "'up' 'local' '--no-console' '--no-test' '--no-interaction'"],
    'down' => ['down', "'down' 'local' '--force' '--no-interaction'"],
    'start' => ['start', "'start' 'local' '--no-interaction'"],
    'stop' => ['stop', "'stop' 'local' '--no-interaction'"],
]);

test('scaling replicas on a dev box project starts a configure-replicas run', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.projects.scaling.replicas', ['box' => 'my-dev-box', 'project' => 'shop']), [
        'environment' => 'local',
        'component' => 'web',
        'count' => 3,
    ])->assertRedirect();

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::ConfigureReplicas)
        ->and($run->subject)->toBe('shop');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => str_contains(str_replace("'\\''", "'", end($cmd)), "'replicas' 'local' '--component=web' '--count=3'"));

    File::deleteDirectory($bin);
});

test('scaling autoscale on a dev box project starts a configure-autoscale run', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.projects.scaling.autoscale', ['box' => 'my-dev-box', 'project' => 'shop']), [
        'environment' => 'production',
        'component' => 'web',
        'min' => 2,
        'max' => 6,
        'cpu' => 75,
    ])->assertRedirect();

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::ConfigureAutoscale);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => str_contains(str_replace("'\\''", "'", end($cmd)), "'autoscale' 'production' '--component=web' '--min=2' '--max=6' '--cpu=75'"));

    File::deleteDirectory($bin);
});

test('scaling resources on a dev box project starts a configure-resources run', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.projects.scaling.resources', ['box' => 'my-dev-box', 'project' => 'shop']), [
        'environment' => 'production',
        'component' => 'web',
        'tier' => 'pro',
    ])->assertRedirect();

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::ConfigureResources);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => str_contains(str_replace("'\\''", "'", end($cmd)), "'resources' 'production' '--component=web' '--tier=pro'"));

    File::deleteDirectory($bin);
});

test('dotenv push and pull on a dev box project start matching runs', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.projects.dotenv.push', ['box' => 'my-dev-box', 'project' => 'shop']), [
        'environment' => 'production',
    ])->assertRedirect();

    expect(Run::sole()->kind)->toBe(RunKind::DotenvPush);

    $this->post(route('devboxes.projects.dotenv.pull', ['box' => 'my-dev-box', 'project' => 'shop']), [
        'environment' => 'production',
    ])->assertRedirect();

    expect(Run::latest('id')->first()->kind)->toBe(RunKind::DotenvPull);

    File::deleteDirectory($bin);
});

test('deploying an app on a box starts a deploy-app run', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    devBoxDomainStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.operate', ['box' => 'my-dev-box', 'project' => 'shop', 'action' => 'deploy']), [
        'environment' => 'production',
    ])->assertRedirect();

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::DeployApp)
        ->and($run->environment)->toBe('production');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => str_contains(str_replace("'\\''", "'", end($cmd)), "'deploy' 'production'"));

    File::deleteDirectory($bin);
});

test('an app on a box has its own page, with what the box reports about it and the runs made on it', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*project:list*' => Process::result(output: json_encode(['success' => true, 'path' => '/home/larakube/projects', 'projects' => [
            ['name' => 'shop', 'path' => '/home/larakube/projects/shop', 'framework' => 'laravel', 'environments' => [['name' => 'local', 'host' => 'shop.kube']], 'local' => 'running'],
            ['name' => 'blog', 'path' => '/home/larakube/projects/blog', 'framework' => 'astro', 'environments' => [], 'local' => 'stopped'],
        ]])),
        '*share:show*' => Process::result(output: json_encode(['success' => true, 'mode' => 'domain', 'zone' => 'example.com', 'urls' => ['web' => 'https://shop-box.example.com'], 'running' => true])),
        '*services:show*' => Process::result(output: json_encode(['success' => true, 'commons' => false, 'services' => [['kind' => 'database', 'label' => 'Database', 'name' => 'SQLite', 'details' => []]]])),
    ]);
    ChildProcess::fake();
    $this->post(route('devboxes.operate', ['box' => 'my-dev-box', 'project' => 'shop', 'action' => 'up']));

    $this->get(route('devboxes.projects.show', ['box' => 'my-dev-box', 'project' => 'shop']))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('devboxes/project')
            ->where('box', 'my-dev-box')
            ->where('name', 'shop')
            ->has('runs', 1)
            ->where('runs.0.label', 'Up shop on my-dev-box')
            ->where('latestRun.label', 'Up shop on my-dev-box')
            ->loadDeferredProps('details', fn (AssertableInertia $page) => $page
                ->where('details.framework', 'laravel')
                ->where('details.local', 'running')
            )
            ->loadDeferredProps('sharing', fn (AssertableInertia $page) => $page
                ->where('sharing.urls.web', 'https://shop-box.example.com')
                ->where('sharing.running', true)
            )
            ->loadDeferredProps('backing', fn (AssertableInertia $page) => $page
                ->where('backing.commons', false)
                ->where('backing.services.0.label', 'Database')
            )
        );

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'cd "$HOME/projects/shop" && larakube')
        && str_contains(implode(' ', (array) $process->command), 'services:show'));

    $this->get(route('devboxes.projects.show', ['box' => 'my-dev-box', 'project' => 'missing']))
        ->assertInertia(fn (AssertableInertia $page) => $page->loadDeferredProps('details', fn (AssertableInertia $page) => $page->where('details.state', 'missing')));

    File::deleteDirectory($bin);
});

test('the page of an app on a box needs a ready box, a plain name and experimental features', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsStacks();
    devBoxProjectsExperimental(true);

    $this->get(route('devboxes.projects.show', ['box' => 'workshop-demo', 'project' => 'shop']))->assertNotFound();
    $this->get('/dev-boxes/my-dev-box/projects/Shop..')->assertNotFound();

    File::deleteDirectory($bin);
});

test('an app page says the box did not answer, apart from the app not being on the box', function () {
    $bin = devBoxProjectsCli();
    devBoxProjectsExperimental(true);
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'my-dev-box', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-central1', 'ip' => '203.0.113.50', 'sshKey' => '/k', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*project:list*' => Process::result(errorOutput: 'ssh: connect to host timed out', exitCode: 255),
    ]);

    $this->get(route('devboxes.projects.show', ['box' => 'my-dev-box', 'project' => 'shop']))
        ->assertInertia(fn (AssertableInertia $page) => $page->loadDeferredProps('details', fn (AssertableInertia $page) => $page->where('details.state', 'unreachable')));

    File::deleteDirectory($bin);
});
