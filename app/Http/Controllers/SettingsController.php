<?php

namespace App\Http\Controllers;

use App\Services\EditorLauncher;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use App\Services\Wsl;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function show(GlobalSettings $settings, ToolLocator $locator, Wsl $wsl, StackCatalog $catalog): Response
    {
        $cli = $locator->find('kubectl');
        $contexts = [];
        $currentContext = null;

        if ($cli !== null) {
            $isolated = $locator->isolate([$cli, 'config', 'get-contexts', '-o', 'name']);
            $res = Process::env($isolated['environment'])->timeout(5)->run($isolated['command']);
            if ($res->successful()) {
                $lines = array_map('trim', explode("\n", trim($res->output())));
                $contexts = array_values(array_filter($lines, fn (string $c): bool => $c !== ''));
            }
            $currIso = $locator->isolate([$cli, 'config', 'current-context']);
            $currRes = Process::env($currIso['environment'])->timeout(5)->run($currIso['command']);
            if ($currRes->successful()) {
                $currentContext = trim($currRes->output());
            }
        }

        return Inertia::render('settings/index', [
            'settings' => $settings->get(),
            'allowedTlds' => GlobalSettings::ALLOWED_TLDS,
            'cloudProviders' => GlobalSettings::CLOUD_PROVIDERS,
            'wslShutdownModes' => GlobalSettings::WSL_SHUTDOWN_MODES,
            'contexts' => $contexts,
            'currentContext' => $currentContext,
            'windows' => $wsl->isWindows(),
            'availableEditors' => app(EditorLauncher::class)->available(),
            'allEditors' => array_map(fn (string $slug, array $ed): array => [
                'slug' => $slug,
                'label' => $ed['label'],
                'category' => $ed['category'] === 'agent' ? 'agent' : 'editor',
            ], array_keys(EditorLauncher::EDITORS), array_values(EditorLauncher::EDITORS)),
            'wsl' => Inertia::defer(fn (): ?array => $wsl->isWindows() ? $wsl->check() : null),
            'serverNames' => Inertia::defer(function () use ($catalog): ?array {
                $stacks = $catalog->all();

                return $stacks === null ? null : array_map(fn (array $stack): string => $stack['name'], $stacks);
            }),
        ]);
    }

    public function update(Request $request, GlobalSettings $settings): RedirectResponse
    {
        $validated = $request->validate([
            'theme' => ['nullable', 'string', 'in:'.implode(',', GlobalSettings::THEMES)],
            'localTld' => ['nullable', 'string', 'in:'.implode(',', GlobalSettings::ALLOWED_TLDS)],
            'email' => ['nullable', 'email'],
            'defaultCloudProvider' => ['nullable', 'string', 'in:'.implode(',', array_keys(GlobalSettings::CLOUD_PROVIDERS))],
            'shareToken' => ['nullable', 'string'],
            'hideProjects' => ['nullable', 'boolean'],
            'experimental' => ['nullable', 'boolean'],
            'cliChannel' => ['nullable', 'string', 'in:canary,stable'],
            'defaultEditor' => ['nullable', 'string', 'in:'.implode(',', array_keys(EditorLauncher::EDITORS))],
            'wslShutdownMode' => ['nullable', 'string', 'in:'.implode(',', GlobalSettings::WSL_SHUTDOWN_MODES)],
            'demoMode' => ['nullable', 'boolean'],
            'demoHiddenServers' => ['nullable', 'array'],
            'demoHiddenServers.*' => ['string'],
        ]);

        $settings->update($validated);

        return back()->with('success', 'Settings updated.');
    }

    public function setTheme(Request $request, GlobalSettings $settings): RedirectResponse
    {
        $validated = $request->validate([
            'theme' => ['required', 'string', 'in:'.implode(',', GlobalSettings::THEMES)],
        ]);

        $settings->setTheme($validated['theme']);

        return back()->with('success', 'Theme updated.');
    }

    public function bridge(string $agent, GlobalSettings $settings): RedirectResponse
    {
        $success = $settings->bridge($agent);

        if ($success) {
            return back()->with('success', "Configured LaraKube MCP servers for {$agent}.");
        }

        return back()->withErrors(['bridge' => "Failed to bridge {$agent}."]);
    }
}
