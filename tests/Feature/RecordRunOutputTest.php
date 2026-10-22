<?php

use App\Enums\RunKind;
use App\Listeners\RecordRunOutput;
use App\Models\Run;
use App\Services\Elevation;
use Native\Desktop\Events\ChildProcess\ProcessExited;

test('elevation is revoked once a local up run finishes, since that is the only reason it was granted', function () {
    $run = Run::create([
        'label' => 'Up shop (local)',
        'kind' => RunKind::UpProject,
        'subject' => 'project:1',
        'environment' => 'local',
        'command' => ['larakube', 'up', 'local'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldReceive('revoke')->once();
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});

test('elevation is left alone for a cloud up run, which never requested it', function () {
    $run = Run::create([
        'label' => 'Up shop (production)',
        'kind' => RunKind::UpProject,
        'subject' => 'project:1',
        'environment' => 'production',
        'command' => ['larakube', 'up', 'production'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldNotReceive('revoke');
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});

test('elevation is revoked once local setup finishes', function () {
    $run = Run::create([
        'label' => 'Set up local development',
        'kind' => RunKind::SetupLocal,
        'subject' => 'local-cluster',
        'command' => ['larakube', 'setup', '--profile=local'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldReceive('revoke')->once();
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});
