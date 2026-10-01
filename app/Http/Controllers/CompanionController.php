<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;
use Illuminate\Validation\Rule;

class CompanionController extends Controller
{
    public const COMPANIONS = [
        'adminer' => [
            'slug' => 'adminer',
            'name' => 'Adminer',
            'description' => 'Universal lightweight manager for MySQL, MariaDB, PostgreSQL, and SQLite.',
            'icon' => '🗄️',
            'port' => 8080,
        ],
        'phpmyadmin' => [
            'slug' => 'phpmyadmin',
            'name' => 'phpMyAdmin',
            'description' => 'Dedicated web interface for MySQL and MariaDB servers.',
            'icon' => '🐬',
            'port' => 80,
        ],
        'pgadmin' => [
            'slug' => 'pgadmin',
            'name' => 'pgAdmin',
            'description' => 'Full-featured web administration platform for PostgreSQL.',
            'icon' => '🐘',
            'port' => 80,
        ],
        'redisinsight' => [
            'slug' => 'redisinsight',
            'name' => 'RedisInsight',
            'description' => 'Visual GUI for Redis keys, streams, memory, and pub/sub metrics.',
            'icon' => '⚡',
            'port' => 5540,
        ],
        'mongo-express' => [
            'slug' => 'mongo-express',
            'name' => 'Mongo Express',
            'description' => 'Web-based admin interface for MongoDB databases and documents.',
            'icon' => '🍃',
            'port' => 8081,
        ],
    ];

    /**
     * @return list<array{slug: string, name: string, description: string, icon: string, installed: bool, running: bool, paused: bool, url: ?string}>
     */
    public function all(ToolLocator $locator, GlobalSettings $settings): array
    {
        $cli = $locator->find('kubectl');
        $deployments = [];

        if ($cli !== null) {
            $isolated = $locator->isolate([$cli, 'get', 'deployment', '-n', 'larakube-companions', '-o', 'json']);
            $result = Process::env($isolated['environment'])->timeout(5)->run($isolated['command']);
            if ($result->successful()) {
                $items = json_decode($result->output(), true)['items'] ?? [];
                if (is_array($items)) {
                    foreach ($items as $item) {
                        $name = $item['metadata']['name'] ?? '';
                        $replicas = (int) ($item['spec']['replicas'] ?? 0);
                        $readyReplicas = (int) ($item['status']['readyReplicas'] ?? 0);
                        $deployments[$name] = [
                            'installed' => true,
                            'running' => $readyReplicas > 0,
                            'paused' => $replicas === 0,
                        ];
                    }
                }
            }
        }

        $tld = $settings->getLocalTld();
        $list = [];

        foreach (self::COMPANIONS as $slug => $info) {
            $dep = $deployments[$slug] ?? null;
            $installed = $dep !== null;
            $running = $dep['running'] ?? false;
            $paused = $dep['paused'] ?? false;

            $list[] = [
                'slug' => $slug,
                'name' => $info['name'],
                'description' => $info['description'],
                'icon' => $info['icon'],
                'installed' => $installed,
                'running' => $running,
                'paused' => $paused,
                'url' => $installed ? "https://{$slug}.{$tld}" : null,
            ];
        }

        return $list;
    }

    public function add(Request $request, CliRunner $runner): RedirectResponse
    {
        $validated = $request->validate([
            'companion' => ['required', Rule::in(array_keys(self::COMPANIONS))],
        ]);

        $slug = $validated['companion'];
        $name = self::COMPANIONS[$slug]['name'];

        $run = $runner->start(
            label: "Add {$name} companion",
            arguments: ['companion:add', $slug],
            kind: RunKind::CompanionAdd,
            subject: "companion:{$slug}",
            meta: ['companion' => $slug],
            targetType: 'companion',
            targetName: $name,
            tool: $slug,
            environment: 'local',
        );

        return to_route('runs.show', $run);
    }

    public function remove(Request $request, CliRunner $runner): RedirectResponse
    {
        $validated = $request->validate([
            'companion' => ['required', Rule::in(array_keys(self::COMPANIONS))],
        ]);

        $slug = $validated['companion'];
        $name = self::COMPANIONS[$slug]['name'];

        $run = $runner->start(
            label: "Remove {$name} companion",
            arguments: ['companion:remove', $slug, '--force'],
            kind: RunKind::CompanionRemove,
            subject: "companion:{$slug}",
            meta: ['companion' => $slug],
            targetType: 'companion',
            targetName: $name,
            tool: $slug,
            environment: 'local',
        );

        return to_route('runs.show', $run);
    }

    public function start(Request $request, CliRunner $runner): RedirectResponse
    {
        $validated = $request->validate([
            'companion' => ['required', Rule::in(array_keys(self::COMPANIONS))],
        ]);

        $slug = $validated['companion'];
        $name = self::COMPANIONS[$slug]['name'];

        $run = $runner->start(
            label: "Start {$name} companion",
            arguments: ['companion:start', $slug],
            kind: RunKind::CompanionStart,
            subject: "companion:{$slug}",
            meta: ['companion' => $slug],
            targetType: 'companion',
            targetName: $name,
            tool: $slug,
            environment: 'local',
        );

        return to_route('runs.show', $run);
    }

    public function stop(Request $request, CliRunner $runner): RedirectResponse
    {
        $validated = $request->validate([
            'companion' => ['required', Rule::in(array_keys(self::COMPANIONS))],
        ]);

        $slug = $validated['companion'];
        $name = self::COMPANIONS[$slug]['name'];

        $run = $runner->start(
            label: "Stop {$name} companion",
            arguments: ['companion:stop', $slug],
            kind: RunKind::CompanionStop,
            subject: "companion:{$slug}",
            meta: ['companion' => $slug],
            targetType: 'companion',
            targetName: $name,
            tool: $slug,
            environment: 'local',
        );

        return to_route('runs.show', $run);
    }
}
