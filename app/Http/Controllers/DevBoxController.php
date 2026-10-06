<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Http\Requests\StoreServerRequest;
use App\Models\Run;
use App\Services\FilePicker;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\DevBoxShell;
use App\Services\LaraKube\DevBoxTunnel;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use App\Services\Runtime\WslDistro;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Experimental. Dev boxes: servers used as development machines, made by `devbox:create`.
 * Restarting and destroying one is the same as for any server the CLI made.
 */
class DevBoxController extends Controller
{
    /** The variable the CLI reads the Cloudflare token from on the box. */
    private const TOKEN_VARIABLE = 'CLOUDFLARE_API_TOKEN';

    public function __construct(private GlobalSettings $settings) {}

    /** With the feature off the page says so and points to Settings, instead of failing. */
    public function index(StackCatalog $catalog): Response
    {
        if (! $this->settings->experimental()) {
            return Inertia::render('devboxes/index', ['disabled' => true]);
        }

        return Inertia::render('devboxes/index', [
            'disabled' => false,
            'devBoxes' => Inertia::defer(fn (): ?array => $catalog->devBoxes()),
        ]);
    }

    public function create(ReadinessCheck $readiness): Response|RedirectResponse
    {
        if (! $this->settings->experimental()) {
            return to_route('devboxes.index');
        }

        return Inertia::render('servers/create', [
            'kind' => 'dev-box',
            'providers' => Inertia::defer(fn (): ?array => $readiness->providers()),
            'project' => null,
        ]);
    }

    public function store(StoreServerRequest $request, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();

        $provider = $request->string('provider')->toString();
        $stackName = $request->string('stack_name')->toString();

        $run = $runner->start(
            label: "Create dev box {$stackName}",
            arguments: [
                'devbox:create',
                "--provider={$provider}",
                "--stack-name={$stackName}",
                '--region='.$request->string('region'),
                '--size='.$request->string('size'),
                '--channel='.$this->settings->get()['cliChannel'],
                '--json',
            ],
            secretEnvironment: $request->secretEnvironment(),
            kind: RunKind::CreateDevBox,
            subject: $stackName,
            meta: ['server' => $stackName, 'role' => 'dev'],
            targetType: 'server',
            targetName: $stackName,
            serverName: $stackName,
        );

        return to_route('runs.show', $run);
    }

    /**
     * Installs the CLI on the box again from the channel Desktop is on. The installer is the one that put it there, so it
     * has the permission to replace the binary and is safe to run any number of times.
     */
    public function updateCli(Request $request, string $box, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();

        $stack = collect($catalog->devBoxes() ?? [])->firstWhere('name', $box);
        abort_if($stack === null || $stack['status'] !== 'ready', 404);

        $channel = $this->settings->get()['cliChannel'] === 'stable' ? '' : ' -s -- --canary';

        $run = $runner->start(
            label: "Update the LaraKube CLI on {$box}",
            arguments: [],
            kind: RunKind::UpdateDevBoxCli,
            subject: $box,
            meta: ['server' => $box, 'role' => 'dev'],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
            devBox: $stack,
            // Also leaves the marker that tells the CLI on the box it is a dev box, for boxes made before it existed.
            devBoxScript: 'curl -fsSL https://cli.larakube.app/install.sh | bash'.$channel
                .' && mkdir -p "$HOME/.larakube" && printf \'%s\\n\' '.escapeshellarg($box).' > "$HOME/.larakube/devbox"'
                .' && /usr/local/bin/larakube --version',
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** Up, down, start or stop an app on the box, as `larakube <action>` in its folder. */
    public function operate(Request $request, string $box, string $project, string $action, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $arguments = match ($action) {
            'up' => ['up', 'local', '--no-console', '--no-test'],
            'down' => ['down', 'local', '--force'],
            'start' => ['start', 'local'],
            'stop' => ['stop', 'local'],
            default => abort(404),
        };

        $run = $runner->start(
            label: ucfirst($action)." {$project} on {$box}",
            arguments: $arguments,
            kind: RunKind::OperateDevBoxProject,
            subject: $project,
            meta: ['server' => $box, 'role' => 'dev', 'app' => $project],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
            devBox: $stack,
            devBoxProject: $project,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    /** One dev box: its apps, its Commons, how to connect. The cluster cards need the tunnel the CLI opens. */
    public function show(string $box, StackCatalog $catalog, DevBoxShell $shell, DevBoxTunnel $tunnel, ClusterStatus $status): Response
    {
        $this->ensureEnabled();
        $stack = collect($catalog->devBoxes() ?? [])->firstWhere('name', $box);
        abort_if($stack === null, 404);

        $ready = $stack['status'] === 'ready';

        return Inertia::render('devboxes/show', [
            'box' => $stack,
            // The apps on the box, asked of the box itself; null when it does not answer.
            'projects' => Inertia::defer(function () use ($ready, $shell, $stack): ?array {
                $result = $ready ? $shell->json($stack, ['project:list', '--json']) : null;

                return is_array($result['projects'] ?? null) ? array_values($result['projects']) : null;
            }, 'projects'),
            // Opens the tunnel first, then asks the cluster through it.
            'cluster' => Inertia::defer(function () use ($ready, $box, $tunnel, $status): array {
                $context = $ready ? $tunnel->connect($box) : null;

                return ['context' => $context, 'plex' => $context !== null ? $status->plex($context) : null];
            }, 'cluster'),
            // Collaborators authorized to access the box via public key.
            'collaborators' => Inertia::defer(function () use ($ready, $shell, $stack): ?array {
                return $ready ? $shell->collaborators($stack) : null;
            }, 'collaborators'),
        ]);
    }

    /** One app on a dev box, laid out like a local project's page. */
    public function showProject(string $box, string $project, StackCatalog $catalog, DevBoxShell $shell): Response
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null || preg_match('/^[a-z0-9][a-z0-9-]*$/', $project) !== 1, 404);

        $runs = Run::query()->where('server_name', $box)->where('subject', $project)->latest('id')->limit(10)->get();

        return Inertia::render('devboxes/project', [
            'box' => $box,
            'name' => $project,
            // What the box reports for this app, or a state saying why it cannot: the box did not answer, or the app is not in ~/projects.
            'details' => Inertia::defer(function () use ($shell, $stack, $project): array {
                $result = $shell->json($stack, ['project:list', '--json']);

                if ($result === null) {
                    return ['state' => 'unreachable'];
                }

                return collect(is_array($result['projects'] ?? null) ? $result['projects'] : [])->firstWhere('name', $project) ?? ['state' => 'missing'];
            }, 'details'),
            // The stable public names the app has from share:domain, and whether their tunnel is up. Null when the box's CLI is too old to say.
            'sharing' => Inertia::defer(function () use ($shell, $stack, $project): ?array {
                $result = $shell->json($stack, ['share:show', 'local', '--json'], 45, null, $project);

                return $result === null ? null : [
                    'zone' => $result['zone'] ?? null,
                    'urls' => is_array($result['urls'] ?? null) ? $result['urls'] : [],
                    'running' => ($result['running'] ?? false) === true,
                ];
            }, 'sharing'),
            // The database, cache, storage and search of the app on the box, as the box's CLI reports them.
            'backing' => Inertia::defer(function () use ($shell, $stack, $project): ?array {
                $result = $shell->json($stack, ['services:show', 'local', '--json'], 45, null, $project);

                return is_array($result['services'] ?? null)
                    ? ['commons' => ($result['commons'] ?? false) === true, 'services' => array_values(array_filter($result['services'], is_array(...)))]
                    : null;
            }, 'backing'),
            'runs' => $runs->map(fn (Run $run): array => ['id' => $run->id, 'label' => $run->label, 'kind' => $run->kind?->value, 'status' => $run->status->value, 'created_at' => $run->created_at?->toISOString(), 'environment' => 'local'])->all(),
            'latestRun' => $runs->first() ? [
                'id' => $runs->first()->id,
                'label' => $runs->first()->label,
                'kind' => $runs->first()->kind?->value,
                'status' => $runs->first()->status->value,
                'output' => (string) $runs->first()->output,
                'startedAt' => $runs->first()->created_at?->toISOString(),
                'finishedAt' => $runs->first()->finished_at?->toISOString(),
            ] : null,
        ]);
    }

    /** The page that asks for a Cloudflare API token and the domain to share an app under. */
    public function shareDomainPage(string $box, string $project, StackCatalog $catalog): Response
    {
        $this->ensureEnabled();
        abort_if($this->readyBox($box, $catalog) === null, 404);

        return Inertia::render('devboxes/share-domain', ['box' => $box, 'project' => $project]);
    }

    /** The domains a Cloudflare API token can see, asked of the box. The token is sent on standard input and not kept. */
    public function domains(Request $request, string $box, StackCatalog $catalog, DevBoxShell $shell): JsonResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $token = $this->cloudflareToken($request);
        $result = $shell->json($stack, ['share:domains', '--json'], 60, [self::TOKEN_VARIABLE, $token]);

        if ($result === null) {
            return response()->json(['message' => 'The box could not list your domains with that token. Check it has Zone → Zone → Read, and that the box is reachable.'], 422);
        }

        return response()->json(['domains' => array_values((array) ($result['domains'] ?? []))]);
    }

    public function shareDomain(Request $request, string $box, string $project, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $request->validate(['domain' => ['required', 'string', 'max:253', 'regex:/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/']]);

        return $this->domainRun($request, $box, $project, $catalog, $runner, RunKind::ShareDomainDevBoxProject, "Share {$project} under {$request->string('domain')->toString()}", ['share', '--domain='.$request->string('domain')->toString(), '--box='.$box, '--json']);
    }

    public function removeDomain(Request $request, string $box, string $project, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        return $this->domainRun($request, $box, $project, $catalog, $runner, RunKind::RemoveDomainDevBoxProject, "Remove the public names of {$project}", ['share:remove', '--force', '--json']);
    }

    /** @param  list<string>  $arguments */
    private function domainRun(Request $request, string $box, string $project, StackCatalog $catalog, CliRunner $runner, RunKind $kind, string $label, array $arguments): RedirectResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $token = $this->cloudflareToken($request);

        $run = $runner->start(
            label: $label,
            arguments: $arguments,
            secretEnvironment: [self::TOKEN_VARIABLE => $token],
            kind: $kind,
            subject: $project,
            meta: ['server' => $box, 'role' => 'dev', 'app' => $project],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
            devBox: $stack,
            devBoxProject: $project,
            devBoxReadSecret: self::TOKEN_VARIABLE,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    public function pickBundle(FilePicker $picker): JsonResponse
    {
        $path = $picker->pick('Select Dev Box Bundle (.devbox)', ['devbox'], 'Dev Box Bundles');

        return response()->json(['path' => $path]);
    }

    public function export(Request $request, string $box, StackCatalog $catalog, CliRunner $runner, ToolLocator $locator): RedirectResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $validated = $request->validate([
            'passphrase' => ['required', 'string', 'min:4'],
            'output' => ['nullable', 'string'],
        ]);

        $isWindows = $locator->isWindows();
        $downloadsDir = ToolLocator::hostDownloadsDirectory($isWindows);
        $sep = $isWindows ? '\\' : DIRECTORY_SEPARATOR;

        $hostOutputPath = ! empty($validated['output'])
            ? (string) $validated['output']
            : $downloadsDir.$sep."{$box}.devbox";

        $cliOutputPath = $isWindows ? WslDistro::toLinux($hostOutputPath) : $hostOutputPath;

        $run = $runner->start(
            label: "Export dev box {$box}",
            arguments: [
                'devbox:export',
                $box,
                "--output={$cliOutputPath}",
                "--passphrase={$validated['passphrase']}",
                '--json',
            ],
            kind: RunKind::ExportDevBox,
            subject: "server:{$box}",
            meta: [
                'server' => $box,
                'role' => 'dev',
                'outputPath' => $hostOutputPath,
            ],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    public function import(Request $request, CliRunner $runner, ToolLocator $locator): RedirectResponse
    {
        $this->ensureEnabled();

        $path = null;
        if ($request->hasFile('bundle')) {
            $uploaded = $request->file('bundle');
            $tempDir = storage_path('framework/temp/devboxes');
            File::ensureDirectoryExists($tempDir);
            $origName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $uploaded->getClientOriginalName() ?: 'export.devbox');
            $path = "{$tempDir}/import-".bin2hex(random_bytes(6)).'-'.$origName;
            $uploaded->move($tempDir, basename($path));
        } else {
            $validated = $request->validate([
                'file' => ['nullable', 'string'],
                'path' => ['nullable', 'string'],
                'name' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9][a-z0-9-]*$/'],
                'passphrase' => ['required', 'string', 'min:4'],
            ]);

            $path = $validated['file'] ?? $validated['path'] ?? null;
        }

        if ($path !== null && str_starts_with($path, '~/')) {
            $path = ToolLocator::home().substr($path, 1);
        }

        if ($path === null || ! file_exists($path)) {
            return back()->withErrors(['file' => 'Provide a valid .devbox bundle file.']);
        }

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9][a-z0-9-]*$/'],
            'passphrase' => ['required', 'string', 'min:4'],
        ]);

        $isWindows = $locator->isWindows();
        $cliPath = $isWindows ? WslDistro::toLinux($path) : $path;

        $args = [
            'devbox:import',
            $cliPath,
            "--passphrase={$validated['passphrase']}",
            '--json',
        ];

        if (! empty($validated['name'])) {
            $args[] = "--name={$validated['name']}";
        }

        $targetName = $validated['name'] ?? basename($path, '.devbox');

        $run = $runner->start(
            label: "Import dev box {$targetName}",
            arguments: $args,
            kind: RunKind::ImportDevBox,
            subject: "server:{$targetName}",
            meta: [
                'server' => $targetName,
                'role' => 'dev',
                'bundlePath' => $path,
            ],
            targetType: 'server',
            targetName: $targetName,
            serverName: $targetName,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    public function grant(Request $request, string $box, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $validated = $request->validate([
            'github' => ['nullable', 'string', 'max:100', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'pubkey' => ['nullable', 'string'],
        ]);

        $github = $validated['github'] ?? null;
        $pubkey = $validated['pubkey'] ?? null;

        if (empty($github) && empty($pubkey)) {
            return back()->withErrors(['github' => 'Specify either a GitHub username or a public key.']);
        }

        $args = ['devbox:grant', $box, '--json'];
        $collaboratorLabel = '';

        if (! empty($github)) {
            $args[] = "--github={$github}";
            $collaboratorLabel = "@{$github}";
        } else {
            $args[] = "--pubkey={$pubkey}";
            $collaboratorLabel = 'public key';
        }

        $run = $runner->start(
            label: "Grant access to {$collaboratorLabel} on {$box}",
            arguments: $args,
            kind: RunKind::GrantDevBoxAccess,
            subject: "server:{$box}",
            meta: [
                'server' => $box,
                'role' => 'dev',
                'collaborator' => $github ?? 'key',
            ],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    public function revoke(Request $request, string $box, StackCatalog $catalog, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();
        $stack = $this->readyBox($box, $catalog);
        abort_if($stack === null, 404);

        $validated = $request->validate([
            'github' => ['nullable', 'string', 'max:100', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'pubkey' => ['nullable', 'string'],
        ]);

        $github = $validated['github'] ?? null;
        $pubkey = $validated['pubkey'] ?? null;

        if (empty($github) && empty($pubkey)) {
            return back()->withErrors(['github' => 'Specify either a GitHub username or a public key to revoke.']);
        }

        $args = ['devbox:revoke', $box, '--json'];
        $collaboratorLabel = '';

        if (! empty($github)) {
            $args[] = "--github={$github}";
            $collaboratorLabel = "@{$github}";
        } else {
            $args[] = "--pubkey={$pubkey}";
            $collaboratorLabel = 'public key';
        }

        $run = $runner->start(
            label: "Revoke access for {$collaboratorLabel} on {$box}",
            arguments: $args,
            kind: RunKind::RevokeDevBoxAccess,
            subject: "server:{$box}",
            meta: [
                'server' => $box,
                'role' => 'dev',
                'collaborator' => $github ?? 'key',
            ],
            targetType: 'server',
            targetName: $box,
            serverName: $box,
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    private function cloudflareToken(Request $request): string
    {
        return trim($request->validate(['token' => ['required', 'string', 'max:200', 'regex:/^[A-Za-z0-9_-]+$/']])['token']);
    }

    /** @return array<string, mixed>|null */
    private function readyBox(string $box, StackCatalog $catalog): ?array
    {
        $stack = collect($catalog->devBoxes() ?? [])->firstWhere('name', $box);

        return $stack !== null && $stack['status'] === 'ready' ? $stack : null;
    }

    private function ensureEnabled(): void
    {
        abort_unless($this->settings->experimental(), 404);
    }
}
