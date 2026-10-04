<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\WorkspaceCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/** Experimental. Development workspaces on a server; the CLI owns what one is. */
class WorkspaceController extends Controller
{
    public function __construct(private GlobalSettings $settings) {}

    public function index(Request $request, StackCatalog $stacks, WorkspaceCatalog $catalog): Response
    {
        $this->ensureEnabled();

        $servers = array_values(array_filter($stacks->all() ?? [], fn (array $s): bool => ($s['context'] ?? null) !== null && $s['status'] === 'ready'));
        $chosen = $this->server($servers, $request->query('server'), fallbackToFirst: true);

        $port = (int) $request->query('port');

        return Inertia::render('workspaces/index', [
            'editor' => $request->query('editor') !== null && $port > 0 ? [
                'workspace' => (string) $request->query('editor'),
                'url' => "http://127.0.0.1:{$port}/",
                // remote dev port => the port it has on this computer
                'apps' => collect((array) $request->query('apps'))->filter(fn (mixed $local, mixed $remote): bool => is_numeric($local) && is_numeric($remote))->map(fn (mixed $local): int => (int) $local)->all(),
            ] : null,
            'servers' => array_map(fn (array $s): array => ['name' => $s['name'], 'kind' => $s['kind'], 'ip' => $s['ip'] ?? null, 'bindings' => $s['bindings'] ?? []], $servers),
            'server' => $chosen['name'] ?? null,
            'options' => Inertia::defer(fn (): ?array => $catalog->options()),
            'workspaces' => Inertia::defer(fn (): ?array => $chosen === null ? [] : $catalog->list($this->flags($chosen), reveal: true)),
        ]);
    }

    public function store(Request $request, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        $this->ensureEnabled();

        $data = $request->validate([
            'server' => ['required', 'string'],
            'name' => ['required', 'regex:/^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/'],
            'repo' => ['required', 'string', 'max:300', 'regex:#^(https://[A-Za-z0-9.-]+/[\w.\-/]+|git@[A-Za-z0-9.-]+:[\w.\-/]+|ssh://[\w.-]+@[A-Za-z0-9.-]+(:\d{1,5})?/[\w.\-/]+)$#'],
            'branch' => ['nullable', 'string', 'max:100', 'regex:#^[A-Za-z0-9][A-Za-z0-9._/-]*$#'],
            'size' => ['nullable', 'string', 'regex:/^[a-z0-9-]+$/'],
            'framework' => ['nullable', 'string', 'regex:/^[a-z]+$/'],
            'runtimeVersion' => ['nullable', 'string', 'regex:/^[0-9][0-9.]*$/'],
        ]);

        $server = $this->server($stacks->all() ?? [], $data['server']);
        abort_if($server === null, 404);

        return $this->run($runner, RunKind::WorkspaceCreate, "Create workspace {$data['name']}", $server, [
            'workspace:create', '--name='.$data['name'], '--repo='.$data['repo'],
            ...($data['branch'] ?? '' ? ['--branch='.$data['branch']] : []),
            ...($data['size'] ?? '' ? ['--size='.$data['size']] : []),
            ...($data['framework'] ?? '' ? ['--framework='.$data['framework']] : []),
            ...($data['runtimeVersion'] ?? '' ? ['--runtime-version='.$data['runtimeVersion']] : []),
        ], $data['name']);
    }

    public function suspend(Request $request, string $workspace, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        return $this->act($request, $workspace, $stacks, $runner, RunKind::WorkspaceSuspend, 'Suspend', ['workspace:suspend']);
    }

    public function resume(Request $request, string $workspace, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        return $this->act($request, $workspace, $stacks, $runner, RunKind::WorkspaceResume, 'Resume', ['workspace:resume']);
    }

    public function destroy(Request $request, string $workspace, StackCatalog $stacks, CliRunner $runner): RedirectResponse
    {
        return $this->act($request, $workspace, $stacks, $runner, RunKind::WorkspaceRemove, 'Delete', ['workspace:remove', '--force']);
    }

    /** Starts the tunnel on a port chosen here, so the page can link to the editor without parsing the run's output. */
    public function open(Request $request, string $workspace, StackCatalog $stacks, CliRunner $runner, WorkspaceCatalog $catalog): RedirectResponse
    {
        $this->ensureEnabled();

        $server = $this->server($stacks->all() ?? [], $request->input('server'));
        abort_if($server === null, 404);

        $port = $this->freePort();

        // The app's dev ports come from the CLI; each gets a free port here so the page can link to it.
        $found = collect($catalog->list($this->flags($server)) ?? [])->firstWhere('name', $workspace);
        $apps = [];
        foreach ($found['devPorts'] ?? [] as $dev) {
            $apps[(int) $dev['port']] = $this->freePort();
        }

        $runner->start(
            label: "Editor tunnel for {$workspace}",
            arguments: ['workspace:open', ...$this->flags($server), '--name='.$workspace, '--port='.$port, ...array_map(fn (int $remote, int $local): string => "--app-port={$local}:{$remote}", array_keys($apps), $apps)],
            kind: RunKind::WorkspaceOpen,
            subject: $workspace,
            meta: ['server' => $server['name']],
            targetType: 'server',
            targetName: $server['name'],
            serverName: $server['name'],
        );

        return to_route('workspaces.index', ['server' => $server['name'], 'editor' => $workspace, 'port' => $port, 'apps' => $apps]);
    }

    /** @param  list<string>  $arguments */
    private function act(Request $request, string $workspace, StackCatalog $stacks, CliRunner $runner, RunKind $kind, string $verb, array $arguments): RedirectResponse
    {
        $this->ensureEnabled();
        abort_unless(preg_match('/^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/', $workspace) === 1, 404);

        $server = $this->server($stacks->all() ?? [], $request->input('server'));
        abort_if($server === null, 404);

        return $this->run($runner, $kind, "{$verb} workspace {$workspace}", $server, [...$arguments, '--name='.$workspace], $workspace);
    }

    /**
     * @param  array<string, mixed>  $server
     * @param  list<string>  $arguments
     */
    private function run(CliRunner $runner, RunKind $kind, string $label, array $server, array $arguments, string $workspace): RedirectResponse
    {
        $run = $runner->start(
            label: $label,
            arguments: [$arguments[0], ...$this->flags($server), ...array_slice($arguments, 1)],
            kind: $kind,
            subject: $workspace,
            meta: ['server' => $server['name'], 'workspace' => $workspace],
            targetType: 'server',
            targetName: $server['name'],
            serverName: $server['name'],
        );

        return to_route('runs.show', $run);
    }

    /**
     * @param  list<array<string, mixed>>  $servers
     * @return array<string, mixed>|null
     */
    private function server(array $servers, mixed $name, bool $fallbackToFirst = false): ?array
    {
        $usable = array_values(array_filter($servers, fn (array $s): bool => ($s['context'] ?? null) !== null));

        foreach ($usable as $server) {
            if ($server['name'] === $name) {
                return $server;
            }
        }

        return $name === null && $fallbackToFirst ? ($usable[0] ?? null) : null;
    }

    /**
     * A server LaraKube made is addressed by its name; a cluster only found in the kubeconfig by its context.
     *
     * @param  array<string, mixed>  $server
     * @return list<string>
     */
    private function flags(array $server): array
    {
        return [($server['kind'] ?? '') === 'discovered' ? '--context='.$server['context'] : '--stack='.$server['name']];
    }

    private function freePort(): int
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0') ?: throw new RuntimeException('No free local port.');
        $port = (int) substr((string) strrchr((string) stream_socket_get_name($socket, false), ':'), 1);
        fclose($socket);

        return $port;
    }

    private function ensureEnabled(): void
    {
        abort_unless($this->settings->experimental(), 404);
    }
}
