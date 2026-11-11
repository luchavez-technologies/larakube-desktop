<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Models\Server;
use App\Services\FilePicker;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class ContextController extends Controller
{
    public function pickFile(FilePicker $picker): JsonResponse
    {
        $path = $picker->pick('Select Kubeconfig File');

        return response()->json(['path' => $path]);
    }

    public function import(Request $request, CliRunner $runner): RedirectResponse
    {
        $path = null;

        if ($request->hasFile('file')) {
            $uploaded = $request->file('file');
            $tempDir = storage_path('framework/temp/kubeconfigs');
            File::ensureDirectoryExists($tempDir);
            $origName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $uploaded->getClientOriginalName() ?: 'config.yaml');
            $path = "{$tempDir}/import-".bin2hex(random_bytes(6)).'-'.$origName;
            $uploaded->move($tempDir, basename($path));
        } else {
            $validated = $request->validate([
                'file' => ['nullable', 'string'],
                'content' => ['nullable', 'string'],
            ]);

            $path = $validated['file'] ?? null;

            if ($path !== null && str_starts_with($path, '~/')) {
                $path = ToolLocator::home().substr($path, 1);
            }

            if ($path === null && ! empty($validated['content'])) {
                $tempDir = storage_path('framework/temp/kubeconfigs');
                File::ensureDirectoryExists($tempDir);
                $path = "{$tempDir}/import-".bin2hex(random_bytes(6)).'.kubeconfig';
                File::put($path, (string) $validated['content']);
            }
        }

        if ($path === null || ! file_exists($path)) {
            return back()->withErrors(['file' => 'Provide a valid kubeconfig file or paste YAML content.']);
        }

        $run = $runner->start(
            label: 'Import Kubeconfig Context',
            arguments: ['context:import', $path],
            kind: RunKind::ContextImport,
            subject: basename($path),
            targetType: 'context',
            targetName: 'kubeconfig',
        );

        return to_route('runs.show', $run);
    }

    public function switchContext(Request $request, CliRunner $runner): RedirectResponse
    {
        $validated = $request->validate([
            'context' => ['required', 'string'],
        ]);

        $context = $validated['context'];

        $run = $runner->start(
            label: "Switch Kube Context to {$context}",
            arguments: ['context', $context],
            kind: RunKind::ContextSwitch,
            subject: $context,
            targetType: 'context',
            targetName: $context,
            context: $context,
        );

        return to_route('runs.show', $run);
    }

    public function backup(CliRunner $runner): RedirectResponse
    {
        $run = $runner->start(
            label: 'Backup Kubeconfig Contexts',
            arguments: ['context:backup'],
            kind: RunKind::ContextBackup,
            subject: 'kubeconfig',
            targetType: 'context',
            targetName: 'kubeconfig',
        );

        return to_route('runs.show', $run);
    }

    public function restore(Request $request, CliRunner $runner): RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'string'],
        ]);

        $file = $validated['file'];

        $run = $runner->start(
            label: 'Restore Kubeconfig Contexts',
            arguments: ['context:restore', $file],
            kind: RunKind::ContextRestore,
            subject: basename($file),
            targetType: 'context',
            targetName: 'kubeconfig',
        );

        return to_route('runs.show', $run);
    }

    public function remove(Request $request, CliRunner $runner, StackCatalog $catalog): RedirectResponse
    {
        $validated = $request->validate([
            'context' => ['required', 'string'],
        ]);

        $context = $validated['context'];

        // If the discovered cluster is a stale SQLite leftover (e.g. from an
        // uninstalled WSL distro) that is no longer present in the live
        // kubeconfig/stack catalog, mark it missing immediately without
        // failing on a missing local kubeconfig entry.
        $staleDiscovered = Server::query()
            ->where('kind', 'discovered')
            ->where(fn ($q) => $q->where('context', $context)->orWhere('name', $context))
            ->first();

        if ($staleDiscovered !== null && $catalog->find($staleDiscovered->name) === null && $catalog->find($context) === null) {
            $staleDiscovered->update(['status' => 'missing']);
            $catalog->forget();

            return back()->with('success', "Removed stale cluster {$staleDiscovered->name}.");
        }

        $run = $runner->start(
            label: "Remove Context {$context}",
            arguments: ['context:remove', $context, '--force'],
            kind: RunKind::ContextRemove,
            subject: $context,
            targetType: 'context',
            targetName: $context,
            context: $context,
        );

        return to_route('runs.show', $run);
    }
}
