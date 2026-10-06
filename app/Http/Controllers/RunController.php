<?php

namespace App\Http\Controllers;

use App\Enums\RunStatus;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use App\Services\Runtime\WslDistro;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;
use Native\Desktop\Facades\Shell;
use Native\Desktop\Facades\Window;

class RunController extends Controller
{
    public function index(StackCatalog $stacks): Response
    {
        $projects = Project::query()->get(['id', 'path'])->keyBy('id');
        $servers = collect($stacks->all() ?? [])->pluck('name', 'name');

        return Inertia::render('runs/index', [
            'runs' => Run::query()->latest('id')->limit(100)->get()->map(function (Run $run) use ($projects, $servers): array {
                [$targetType, $targetName, $targetUrl] = $this->resolveTarget($run, $projects, $servers);

                return [
                    'id' => $run->id,
                    'label' => $run->label,
                    'kind' => $run->kind?->value,
                    'status' => $run->status->value,
                    'startedAt' => $run->created_at?->toIso8601String(),
                    'finishedAt' => $run->finished_at?->toIso8601String(),
                    'targetType' => $targetType,
                    'targetName' => $targetName,
                    'targetUrl' => $targetUrl,
                    'environment' => $run->environment ?? (is_array($run->meta) ? ($run->meta['environment'] ?? null) : null),
                ];
            })->all(),
        ]);
    }

    /**
     * @param  Collection<int, Project>  $projects
     * @param  Collection<string, string>  $servers
     * @return array{0: string, 1: ?string, 2: ?string}
     */
    private function resolveTarget(Run $run, Collection $projects, Collection $servers): array
    {
        // First-class columns resolution
        if ($run->target_type !== null) {
            $targetType = $run->target_type;
            $targetName = $run->target_name;
            $targetUrl = null;

            if ($targetType === 'project') {
                if ($run->project_id !== null && isset($projects[$run->project_id])) {
                    $targetUrl = route('projects.show', $run->project_id);
                    $targetName ??= basename($projects[$run->project_id]->path);
                } elseif ($targetName !== null) {
                    $matched = $projects->first(fn (Project $p): bool => basename($p->path) === $targetName);
                    if ($matched) {
                        $targetUrl = route('projects.show', $matched->id);
                    }
                }
            } elseif ($targetType === 'server') {
                $targetName ??= $run->server_name;
                if ($targetName !== null && $servers->has($targetName)) {
                    $targetUrl = route('servers.show', $targetName);
                }
            }

            return [$targetType, $targetName, $targetUrl];
        }

        // Legacy fallback
        $meta = $run->meta ?? [];
        $kind = $run->kind !== null ? $run->kind->value : '';
        $subject = $run->subject;
        $targetType = 'system';
        $targetName = null;
        $targetUrl = null;

        if (str_contains($kind, 'project') || in_array($kind, ['deploy-app', 'configure-host', 'link-server', 'plex-join', 'plex-leave'], true)) {
            $targetType = 'project';
            $metaProject = $meta['project'] ?? null;

            if ($metaProject !== null && is_numeric($metaProject) && isset($projects[(int) $metaProject])) {
                $p = $projects[(int) $metaProject];
                $targetName = basename($p->path);
                $targetUrl = route('projects.show', $p->id);
            } elseif ($metaProject !== null && ! is_numeric($metaProject)) {
                $targetName = $metaProject;
                $matched = $projects->first(fn (Project $p): bool => basename($p->path) === $targetName);
                if ($matched) {
                    $targetUrl = route('projects.show', $matched->id);
                }
            } elseif ($subject !== null && str_starts_with($subject, 'project:')) {
                $pid = (int) substr($subject, 8);
                if (isset($projects[$pid])) {
                    $p = $projects[$pid];
                    $targetName = basename($p->path);
                    $targetUrl = route('projects.show', $p->id);
                }
            } elseif ($subject !== null && (is_dir($subject) || str_contains($subject, '/'))) {
                $targetName = basename($subject);
                $matched = $projects->first(fn (Project $p): bool => $p->path === $subject);
                if ($matched) {
                    $targetUrl = route('projects.show', $matched->id);
                }
            }
        } elseif (str_contains($kind, 'server') || in_array($kind, ['connect-domain', 'enable-ssl', 'install-cluster-tool', 'remove-cluster-tool', 'plex-init', 'plex-start', 'plex-stop'], true)) {
            $targetType = 'server';
            $targetName = $meta['server'] ?? $subject;
            if ($targetName !== null && $servers->has($targetName)) {
                $targetUrl = route('servers.show', $targetName);
            }
        } elseif ($kind === 'install-tool' || isset($meta['tool'])) {
            $targetType = 'tool';
            $targetName = $meta['tool'] ?? $subject;
        }

        if ($targetName === null || is_numeric($targetName)) {
            if (preg_match('/(?:Deploy|address of|Link|app|Up|Create\s+(?:[a-zA-Z0-9_]+\s+)?app)\s+([a-zA-Z0-9_-]+)/i', $run->label, $matches) === 1) {
                $targetType = 'project';
                $targetName = $matches[1];
                $matched = $projects->first(fn (Project $p): bool => basename($p->path) === $targetName);
                if ($matched) {
                    $targetUrl = route('projects.show', $matched->id);
                }
            } elseif (preg_match('/(?:server)\s+([a-zA-Z0-9_-]+)/i', $run->label, $matches) === 1) {
                $targetType = 'server';
                $targetName = $matches[1];
                if ($servers->has($targetName)) {
                    $targetUrl = route('servers.show', $targetName);
                }
            }
        }

        if ($targetName !== null && is_numeric($targetName)) {
            $targetName = null;
        }

        return [$targetType, $targetName, $targetUrl];
    }

    public function show(Run $run): Response
    {
        return Inertia::render('runs/show', [
            'run' => [
                'id' => $run->id,
                'label' => $run->label,
                'kind' => $run->kind?->value,
                'subject' => $run->subject,
                'targetType' => $run->target_type,
                'targetName' => $run->target_name,
                'projectId' => $run->project_id,
                'projectName' => $run->project_name,
                'environment' => $run->environment,
                'serverName' => $run->server_name,
                'context' => $run->context,
                'tool' => $run->tool,
                'meta' => $run->meta,
                'status' => $run->status->value,
                'exitCode' => $run->exit_code,
                'output' => $run->output,
                'result' => $run->result,
                'startedAt' => $run->created_at?->toIso8601String(),
                'finishedAt' => $run->finished_at?->toIso8601String(),
            ],
        ]);
    }

    public function cancel(Request $request, Run $run, CliRunner $runner): RedirectResponse
    {
        if ($run->status === RunStatus::Running) {
            $run->update(['status' => RunStatus::Cancelled]);
            $runner->cancel($run);
        }

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    public function stream(Run $run): JsonResponse
    {
        return response()->json([
            'id' => $run->id,
            'label' => $run->label,
            'kind' => $run->kind?->value,
            'status' => $run->status->value,
            'output' => $run->output,
            'exitCode' => $run->exit_code,
            'startedAt' => $run->created_at?->toIso8601String(),
            'finishedAt' => $run->finished_at?->toIso8601String(),
        ]);
    }

    public function detach(Run $run): JsonResponse
    {
        Window::open("run-{$run->id}")
            ->title($run->label)
            ->url(route('runs.show', ['run' => $run, 'detached' => 1]))
            ->width(820)
            ->height(560)
            ->minWidth(600)
            ->minHeight(400)
            ->rememberState();

        return response()->json(['detached' => true]);
    }

    public function reveal(Request $request, Run $run, ToolLocator $locator): RedirectResponse
    {
        $type = (string) $request->input('type', 'kubeconfig');
        $path = $type === 'rbac'
            ? ($run->meta['rbacPath'] ?? null)
            : ($run->meta['kubeconfigPath'] ?? null);

        if (! $path && $type === 'kubeconfig' && preg_match('/Kubeconfig:\s*(\S+?\.kubeconfig)/i', $run->output, $matches)) {
            $path = $matches[1];
        }

        if (is_string($path) && $locator->isWindows()) {
            $path = WslDistro::toWindows($path);
        }

        if (is_string($path) && file_exists($path)) {
            Shell::showInFolder($path);
        }

        return back();
    }

    public function fileContent(Request $request, Run $run, ToolLocator $locator): JsonResponse
    {
        $type = (string) $request->query('type', 'kubeconfig');
        $path = $type === 'rbac'
            ? ($run->meta['rbacPath'] ?? null)
            : ($run->meta['kubeconfigPath'] ?? null);

        if (! $path && $type === 'kubeconfig' && preg_match('/Kubeconfig:\s*(\S+?\.kubeconfig)/i', $run->output, $matches)) {
            $path = $matches[1];
        }

        if (is_string($path) && $locator->isWindows()) {
            $path = WslDistro::toWindows($path);
        }

        if (! is_string($path) || ! file_exists($path)) {
            return response()->json(['content' => null, 'error' => 'File not found on disk.'], 404);
        }

        return response()->json([
            'type' => $type,
            'path' => $path,
            'filename' => basename($path),
            'content' => file_get_contents($path),
        ]);
    }
}
