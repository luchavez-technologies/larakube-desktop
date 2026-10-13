<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\GlobalSettings;
use Inertia\Testing\AssertableInertia;

test('inertia shares activeRuns and recentRuns for sidebar notification bell', function () {
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hasCompletedOnboarding')->andReturnTrue();
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturnFalse();
    $settings->shouldReceive('demoMode')->andReturnFalse();
    app()->instance(GlobalSettings::class, $settings);

    // Create 6 runs, including 1 running run
    for ($i = 1; $i <= 5; $i++) {
        Run::create([
            'label' => "Run #{$i}",
            'command' => ['larakube'],
            'status' => RunStatus::Succeeded,
        ]);
    }

    $activeRun = Run::create([
        'label' => 'Deploy active run',
        'command' => ['larakube', 'deploy'],
        'status' => RunStatus::Running,
    ]);

    $this->get(route('runs.index'))
        ->assertOk()
        ->assertInertia(function (AssertableInertia $page) use ($activeRun) {
            $page->has('activeRuns', 1, function (AssertableInertia $page) use ($activeRun) {
                $page->where('id', $activeRun->id)
                    ->where('label', 'Deploy active run')
                    ->where('status', 'running')
                    ->etc();
            });

            // recentRuns should have limit of 5 latest runs
            $page->has('recentRuns', 5, function (AssertableInertia $page) use ($activeRun) {
                $page->where('id', $activeRun->id)
                    ->where('label', 'Deploy active run')
                    ->where('status', 'running')
                    ->etc();
            });
        });
});
