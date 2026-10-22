<?php

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\ProjectGroup;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function groupSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    $api = "{$home}/code/shop-api";
    $web = "{$home}/code/shop-web";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists($api);
    File::ensureDirectoryExists($web);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin, 'api' => realpath($api), 'web' => realpath($web)];
}

test('a project can be assigned to a group and ungrouped, redirecting back for Inertia', function () {
    $sandbox = groupSandbox();
    $project = Project::create(['path' => $sandbox['api']]);

    expect($project->group)->toBeNull();

    // Assign to 'Shop' — must redirect (Inertia), never plain JSON
    $this->post(route('projects.group', $project), ['group' => 'Shop'])
        ->assertRedirect();

    expect($project->fresh()->group)->toBe('Shop');

    // Rename group to 'E-Commerce'
    $this->post(route('projects.group', $project), ['group' => 'E-Commerce'])
        ->assertRedirect();

    expect($project->fresh()->group)->toBe('E-Commerce');

    // Clear group
    $this->post(route('projects.group', $project), ['group' => null])
        ->assertRedirect();

    expect($project->fresh()->group)->toBeNull();

    File::deleteDirectory($sandbox['home']);
});

test('group assignment validates group name length', function () {
    $sandbox = groupSandbox();
    $project = Project::create(['path' => $sandbox['api']]);

    $this->post(route('projects.group', $project), ['group' => str_repeat('a', 105)])
        ->assertSessionHasErrors('group');

    File::deleteDirectory($sandbox['home']);
});

test('projects index returns group property and group colors in inertia props', function () {
    $sandbox = groupSandbox();
    $p1 = Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);
    $p2 = Project::create(['path' => $sandbox['web']]);
    ProjectGroup::create(['name' => 'Shop', 'color' => 'violet']);

    $this->get(route('projects.index'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/index')
            ->has('projects', 2)
            ->where('projects.0.group', fn ($g) => $g === 'Shop' || $g === null)
            ->where('groupColors.Shop', 'violet')
        );

    File::deleteDirectory($sandbox['home']);
});

test('starting a project group runs start on all member codebases', function () {
    $sandbox = groupSandbox();
    $fake = ChildProcess::fake();
    $p1 = Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);
    $p2 = Project::create(['path' => $sandbox['web'], 'group' => 'Shop']);
    $standalone = Project::create(['path' => $sandbox['home'], 'group' => null]);

    $this->post(route('projects.groups.start', ['group' => 'Shop']))
        ->assertRedirect();

    $startedRuns = Run::query()->where('kind', RunKind::StartProject)->get();
    expect($startedRuns)->toHaveCount(2)
        ->and($startedRuns->pluck('project_id')->all())->toContain($p1->id, $p2->id)
        ->and($startedRuns->pluck('project_id')->all())->not->toContain($standalone->id);

    File::deleteDirectory($sandbox['home']);
});

test('stopping a project group runs stop on all member codebases', function () {
    $sandbox = groupSandbox();
    $fake = ChildProcess::fake();
    $p1 = Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);
    $p2 = Project::create(['path' => $sandbox['web'], 'group' => 'Shop']);

    $this->post(route('projects.groups.stop', ['group' => 'Shop']))
        ->assertRedirect();

    $stoppedRuns = Run::query()->where('kind', RunKind::StopProject)->get();
    expect($stoppedRuns)->toHaveCount(2)
        ->and($stoppedRuns->pluck('project_id')->all())->toContain($p1->id, $p2->id);

    File::deleteDirectory($sandbox['home']);
});

test('bringing a project group up runs up on every member codebase only', function () {
    $sandbox = groupSandbox();
    ChildProcess::fake();
    $p1 = Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);
    $p2 = Project::create(['path' => $sandbox['web'], 'group' => 'Shop']);
    $standalone = Project::create(['path' => $sandbox['home'], 'group' => null]);

    $this->post(route('projects.groups.up', ['group' => 'Shop']))
        ->assertRedirect();

    $runs = Run::query()->where('kind', RunKind::UpProject)->get();
    expect($runs)->toHaveCount(2)
        ->and($runs->pluck('project_id')->all())->toContain($p1->id, $p2->id)
        ->and($runs->pluck('project_id')->all())->not->toContain($standalone->id);

    File::deleteDirectory($sandbox['home']);
});

test('taking a project group down runs down on every member codebase', function () {
    $sandbox = groupSandbox();
    ChildProcess::fake();
    $p1 = Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);
    $p2 = Project::create(['path' => $sandbox['web'], 'group' => 'Shop']);

    $this->post(route('projects.groups.down', ['group' => 'Shop']))
        ->assertRedirect();

    $runs = Run::query()->where('kind', RunKind::DownProject)->get();
    expect($runs)->toHaveCount(2)
        ->and($runs->pluck('project_id')->all())->toContain($p1->id, $p2->id);

    File::deleteDirectory($sandbox['home']);
});

test('assigning a project to a group creates a ProjectGroup record', function () {
    $sandbox = groupSandbox();
    $project = Project::create(['path' => $sandbox['api']]);

    expect(ProjectGroup::where('name', 'Shop')->exists())->toBeFalse();

    $this->post(route('projects.group', $project), ['group' => 'Shop'])
        ->assertRedirect();

    expect(ProjectGroup::where('name', 'Shop')->exists())->toBeTrue();

    File::deleteDirectory($sandbox['home']);
});

test('a group color can be set and cleared', function () {
    $sandbox = groupSandbox();
    Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);

    $this->post(route('projects.groups.color', ['group' => 'Shop']), ['color' => 'violet'])
        ->assertRedirect();

    expect(ProjectGroup::where('name', 'Shop')->first()->color)->toBe('violet');

    $this->post(route('projects.groups.color', ['group' => 'Shop']), ['color' => null])
        ->assertRedirect();

    expect(ProjectGroup::where('name', 'Shop')->first()->color)->toBeNull();

    File::deleteDirectory($sandbox['home']);
});

test('a group color must be one of the allowed swatches', function () {
    $sandbox = groupSandbox();
    Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);

    $this->post(route('projects.groups.color', ['group' => 'Shop']), ['color' => 'tangerine'])
        ->assertSessionHasErrors('color');

    File::deleteDirectory($sandbox['home']);
});

test('renaming a group moves every member project and the color record in one go', function () {
    $sandbox = groupSandbox();
    $p1 = Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);
    $p2 = Project::create(['path' => $sandbox['web'], 'group' => 'Shop']);
    ProjectGroup::create(['name' => 'Shop', 'color' => 'violet']);

    $this->post(route('projects.groups.rename', ['group' => 'Shop']), ['name' => 'E-Commerce'])
        ->assertRedirect();

    expect($p1->fresh()->group)->toBe('E-Commerce')
        ->and($p2->fresh()->group)->toBe('E-Commerce')
        ->and(ProjectGroup::where('name', 'Shop')->exists())->toBeFalse()
        ->and(ProjectGroup::where('name', 'E-Commerce')->first()->color)->toBe('violet');

    File::deleteDirectory($sandbox['home']);
});

test('renaming a group into an existing group name merges and keeps the destination color', function () {
    $sandbox = groupSandbox();
    $p1 = Project::create(['path' => $sandbox['api'], 'group' => 'Shop']);
    $p2 = Project::create(['path' => $sandbox['web'], 'group' => 'Storefront']);
    ProjectGroup::create(['name' => 'Shop', 'color' => 'violet']);
    ProjectGroup::create(['name' => 'Storefront', 'color' => 'rose']);

    $this->post(route('projects.groups.rename', ['group' => 'Shop']), ['name' => 'Storefront'])
        ->assertRedirect();

    expect($p1->fresh()->group)->toBe('Storefront')
        ->and($p2->fresh()->group)->toBe('Storefront')
        ->and(ProjectGroup::where('name', 'Shop')->exists())->toBeFalse()
        ->and(ProjectGroup::where('name', 'Storefront')->first()->color)->toBe('rose');

    File::deleteDirectory($sandbox['home']);
});
