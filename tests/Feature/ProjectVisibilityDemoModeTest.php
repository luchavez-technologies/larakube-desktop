<?php

use App\Models\Project;
use App\Models\ProjectGroup;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;

function visibilitySandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    $hidden = "{$home}/code/hidden-app";
    $visibleInHiddenGroup = "{$home}/code/sibling-app";
    $visible = "{$home}/code/visible-app";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists($hidden);
    File::ensureDirectoryExists($visibleInHiddenGroup);
    File::ensureDirectoryExists($visible);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return [
        'home' => realpath($home),
        'hidden' => realpath($hidden),
        'siblingInHiddenGroup' => realpath($visibleInHiddenGroup),
        'visible' => realpath($visible),
    ];
}

test('an individually hidden project disappears from Project::visible() when Demo Mode is on', function () {
    $sandbox = visibilitySandbox();

    $hiddenProject = Project::create(['path' => $sandbox['hidden'], 'hidden_in_demo' => true]);
    $visibleProject = Project::create(['path' => $sandbox['visible'], 'hidden_in_demo' => false]);

    app(GlobalSettings::class)->update(['demoMode' => false]);
    expect(Project::visible()->pluck('path')->all())->toContain($hiddenProject->path, $visibleProject->path);

    app(GlobalSettings::class)->update(['demoMode' => true]);
    expect(Project::visible()->pluck('path')->all())
        ->not->toContain($hiddenProject->path)
        ->toContain($visibleProject->path);

    File::deleteDirectory($sandbox['home']);
});

test('hiding a Project Group cascades to every project with that group, even if not individually hidden', function () {
    $sandbox = visibilitySandbox();

    ProjectGroup::create(['name' => 'Internal', 'hidden_in_demo' => true]);
    $memberProject = Project::create(['path' => $sandbox['siblingInHiddenGroup'], 'group' => 'Internal', 'hidden_in_demo' => false]);
    $otherProject = Project::create(['path' => $sandbox['visible'], 'group' => null, 'hidden_in_demo' => false]);

    app(GlobalSettings::class)->update(['demoMode' => true]);

    expect(Project::visible()->pluck('path')->all())
        ->not->toContain($memberProject->path)
        ->toContain($otherProject->path);

    File::deleteDirectory($sandbox['home']);
});

test('ProjectController index omits hidden projects and hidden-group projects from the Inertia projects prop', function () {
    $sandbox = visibilitySandbox();

    Project::create(['path' => $sandbox['hidden'], 'name' => 'hidden-app', 'hidden_in_demo' => true]);
    $visible = Project::create(['path' => $sandbox['visible'], 'name' => 'visible-app', 'hidden_in_demo' => false]);

    app(GlobalSettings::class)->update(['demoMode' => true]);

    $this->get(route('projects.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('projects', 1)
            ->where('projects.0.id', $visible->id)
        );

    File::deleteDirectory($sandbox['home']);
});

test('a hidden project 404s on show() and showFolder() while Demo Mode is on, and is reachable when off', function () {
    $sandbox = visibilitySandbox();

    $project = Project::create(['path' => $sandbox['hidden'], 'hidden_in_demo' => true]);

    app(GlobalSettings::class)->update(['demoMode' => true]);
    $this->get(route('projects.show', $project))->assertNotFound();

    app(GlobalSettings::class)->update(['demoMode' => false]);
    $this->get(route('projects.show', $project))->assertOk();

    File::deleteDirectory($sandbox['home']);
});
