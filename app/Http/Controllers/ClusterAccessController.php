<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClusterAccessController extends Controller
{
    public function grant(Request $request, string $server, StackCatalog $stacks, CliRunner $runner, ClusterStatus $status): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50', 'regex:/^[a-z0-9_-]+$/i'],
            'role' => ['required', Rule::in(['edit', 'read', 'admin'])],
            'scope' => ['nullable', 'string'],
            'cluster' => ['nullable', 'boolean'],
        ]);

        $name = $validated['name'];
        $role = $validated['role'];
        $isCluster = (bool) ($validated['cluster'] ?? false);
        $scope = $validated['scope'] ?? null;

        $downloads = ToolLocator::home().DIRECTORY_SEPARATOR.'Downloads';
        $destinationDir = is_dir($downloads) ? $downloads : storage_path('app');

        $kubeconfigPath = $destinationDir.DIRECTORY_SEPARATOR."{$name}.kubeconfig";
        $rbacPath = $destinationDir.DIRECTORY_SEPARATOR."{$name}-rbac.yaml";

        $args = [
            'cluster:grant',
            "--name={$name}",
            "--context={$stack['context']}",
            "--{$role}",
            "--output={$kubeconfigPath}",
            "--export-rbac={$rbacPath}",
        ];

        if ($isCluster) {
            $args[] = '--cluster';
        } elseif (! empty($scope)) {
            $args[] = "--namespaces={$scope}";
        } else {
            $args[] = '--namespaces=production';
        }

        $status->forgetClusterUsers($stack['context']);

        $run = $runner->start(
            label: "Grant access to {$name} on {$server}",
            arguments: $args,
            kind: RunKind::ClusterGrant,
            subject: "server:{$server}",
            meta: [
                'server' => $server,
                'teammate' => $name,
                'role' => $role,
                'cluster' => $isCluster ? 'true' : 'false',
                'scope' => $isCluster ? 'cluster' : ($scope ?: 'production'),
                'kubeconfigPath' => $kubeconfigPath,
                'rbacPath' => $rbacPath,
            ],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return $request->header('X-Inertia') ? back() : to_route('runs.show', $run);
    }

    public function revoke(Request $request, string $server, StackCatalog $stacks, CliRunner $runner, ClusterStatus $status): RedirectResponse
    {
        $stack = $stacks->find($server);
        abort_unless($stack !== null && is_string($stack['context']), 404);

        $validated = $request->validate([
            'name' => ['required', 'string'],
        ]);

        $name = $validated['name'];
        $status->forgetClusterUsers($stack['context']);

        $run = $runner->start(
            label: "Revoke access for {$name} on {$server}",
            arguments: ['cluster:revoke', $name, "--context={$stack['context']}"],
            kind: RunKind::ClusterRevoke,
            subject: "server:{$server}",
            meta: ['server' => $server, 'teammate' => $name],
            targetType: 'server',
            targetName: $server,
            serverName: $server,
            context: $stack['context'],
        );

        return to_route('runs.show', $run);
    }
}
