<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\FleetMetrics;

test('fleet metrics summary aggregates servers, projects, and 30-day deploys', function () {
    $service = new FleetMetrics;

    $project = Project::create(['path' => '/code/demo-app']);

    $run1 = new Run([
        'label' => 'Deploy demo-app (production)',
        'kind' => RunKind::DeployApp,
        'status' => RunStatus::Succeeded,
        'project_id' => $project->id,
        'command' => ['deploy', 'app'],
        'finished_at' => now()->subDays(2)->addSeconds(40),
    ]);
    $run1->timestamps = false;
    $run1->created_at = now()->subDays(2);
    $run1->save();

    $run2 = new Run([
        'label' => 'Deploy demo-app (staging)',
        'kind' => RunKind::DeployApp,
        'status' => RunStatus::Failed,
        'project_id' => $project->id,
        'command' => ['deploy', 'app'],
        'finished_at' => now()->subDays(1)->addSeconds(20),
    ]);
    $run2->timestamps = false;
    $run2->created_at = now()->subDays(1);
    $run2->save();

    $servers = [
        ['name' => 'srv-1', 'status' => 'ready'],
        ['name' => 'srv-2', 'status' => 'creating'],
    ];
    $projects = [
        ['name' => 'demo-app'],
    ];

    $summary = $service->summary($servers, $projects);

    expect($summary['totalServers'])->toBe(2)
        ->and($summary['readyServers'])->toBe(1)
        ->and($summary['totalProjects'])->toBe(1)
        ->and($summary['deploys30d'])->toBe(2)
        ->and($summary['deploySuccessRate'])->toBe(50)
        ->and($summary['avgDeployDurationSeconds'])->toBe(40)
        ->and(count($summary['deployActivity14d']))->toBe(14);
});

test('project deploy stats calculates totals and 14-day activity', function () {
    $service = new FleetMetrics;

    $project = Project::create(['path' => '/code/acme']);

    $run = new Run([
        'label' => 'Deploy acme (production)',
        'kind' => RunKind::DeployApp,
        'status' => RunStatus::Succeeded,
        'project_id' => $project->id,
        'command' => ['deploy', 'app'],
        'finished_at' => now()->subHours(5)->addSeconds(35),
    ]);
    $run->timestamps = false;
    $run->created_at = now()->subHours(5);
    $run->save();

    $stats = $service->projectDeployStats($project->id);

    expect($stats['totalDeploys'])->toBe(1)
        ->and($stats['successRate'])->toBe(100)
        ->and($stats['avgDurationSeconds'])->toBe(35)
        ->and($stats['lastDeployedAt'])->not->toBeNull()
        ->and(count($stats['activity14d']))->toBe(14)
        ->and(array_sum($stats['activity14d']))->toBe(1);
});
