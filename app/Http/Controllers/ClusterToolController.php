<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Http\Requests\InstallClusterToolRequest;
use App\Http\Requests\RemoveClusterToolRequest;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ClusterToolController extends Controller
{
    public function __construct(private StackCatalog $stacks, private ToolCatalog $tools) {}

    /** The sidebar's Tools entry: the server last browsed, else the first ready one, else Servers. */
    public function entry(): RedirectResponse
    {
        $ready = array_values(array_filter($this->stacks->all() ?? [], fn (array $stack): bool => $stack['status'] === 'ready' && $stack['context'] !== null));
        $names = array_column($ready, 'name');
        $last = session('tools.server');

        if (is_string($last) && in_array($last, $names, true)) {
            return to_route('servers.tools.index', $last);
        }

        return $names === [] ? to_route('servers.index') : to_route('servers.tools.index', $names[0]);
    }

    public function index(string $server): Response
    {
        $stack = $this->readyServer($server);
        session(['tools.server' => $server]);

        return Inertia::render('tools/index', [
            'server' => $stack,
            'servers' => array_values(array_filter($this->stacks->all() ?? [], fn (array $s): bool => $s['status'] === 'ready')),
            'tools' => Inertia::defer(fn (): ?array => $this->tools->forContext((string) $stack['context'])),
            'installing' => $this->installingTools($server),
        ]);
    }

    public function show(Request $request, string $server, string $tool): Response
    {
        $stack = $this->readyServer($server);
        $row = $this->tools->find((string) $stack['context'], $tool, $request->string('instance')->toString());

        abort_if($row === null, 404);

        return Inertia::render('tools/show', [
            'server' => $stack,
            'tool' => $row,
        ]);
    }

    public function store(InstallClusterToolRequest $request, string $server, string $tool): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $row = $this->tools->find($context, $tool);

        abort_if($row === null, 404);

        $run = app(CliRunner::class)->start(
            label: 'Install '.$this->displayName($row)." on {$server}",
            arguments: [
                'tool:add',
                "--tool={$tool}",
                "--context={$context}",
                '--domain='.$request->string('domain'),
                $request->boolean('wire_sso') ? '--wire-sso' : '--no-wire-sso',
                $request->boolean('wire_mail') ? '--wire-mail' : '--no-wire-mail',
                '--force',
            ],
            kind: RunKind::InstallClusterTool,
            subject: $tool,
            meta: ['server' => $server, 'context' => $context, 'tool' => $tool],
        );

        return to_route('runs.show', $run);
    }

    public function destroy(RemoveClusterToolRequest $request, string $server, string $tool): RedirectResponse
    {
        $stack = $this->readyServer($server);
        $context = (string) $stack['context'];
        $row = $this->tools->find($context, $tool, $request->string('instance')->toString());

        abort_if($row === null || ! $row['installed'], 404);

        // The host is an instance's identity, so --domain removes exactly this one.
        $host = is_string($row['host'] ?? null) && $row['host'] !== '' ? $row['host'] : null;

        $run = app(CliRunner::class)->start(
            label: 'Remove '.$this->displayName($row)." from {$server}",
            arguments: ["{$tool}:remove", 'production', "--context={$context}", ...($host !== null ? ["--domain={$host}"] : []), '--force'],
            kind: RunKind::RemoveClusterTool,
            subject: $tool,
            meta: ['server' => $server, 'context' => $context, 'tool' => $tool],
        );

        return to_route('runs.show', $run);
    }

    public function refresh(string $server): RedirectResponse
    {
        $this->tools->forget((string) $this->readyServer($server)['context']);

        return to_route('servers.tools.index', $server);
    }

    /**
     * The tool's name without the "[instance]" suffix the CLI appends.
     *
     * @param  array<string, mixed>  $row
     */
    private function displayName(array $row): string
    {
        return (string) preg_replace('/\s*\[[^\]]*\]$/', '', (string) $row['brand']);
    }

    /**
     * @return array<string, mixed>
     */
    private function readyServer(string $server): array
    {
        $stack = $this->stacks->find($server);

        abort_if($stack === null || $stack['status'] !== 'ready' || $stack['context'] === null, 404);

        return $stack;
    }

    /**
     * Tool slug => run id, for installs still running on this server.
     *
     * @return array<string, int>
     */
    private function installingTools(string $server): array
    {
        return Run::query()
            ->where('kind', RunKind::InstallClusterTool)
            ->where('status', RunStatus::Running)
            ->get()
            ->filter(fn (Run $run): bool => ($run->meta['server'] ?? null) === $server)
            ->mapWithKeys(fn (Run $run): array => [(string) $run->subject => $run->id])
            ->all();
    }
}
