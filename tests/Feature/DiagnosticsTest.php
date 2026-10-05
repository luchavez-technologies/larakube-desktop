<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

test('the report gathers versions, the CLI, failed runs and the log, and removes secrets', function () {
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: false, directories: []));
    Process::fake(['*' => Process::result(exitCode: 1)]);

    $run = Run::create(['label' => 'Update LaraKube CLI', 'command' => ['larakube', 'update'], 'status' => RunStatus::Failed, 'exit_code' => 1]);
    $run->appendTo('output', "downloading\napi_key=sk-live-123456 failed\nAuthorization: Bearer abc.def.ghi\nAKIAIOSFODNN7EXAMPLE\n");

    $report = $this->getJson('/diagnostics')->assertOk()->json('report');

    expect($report)->toContain('LaraKube Desktop')
        ->toContain('LaraKube CLI: not found')
        ->toContain('#'.$run->id.' Update LaraKube CLI (exit 1)')
        ->toContain('downloading')
        ->not->toContain('sk-live-123456')
        ->not->toContain('abc.def.ghi')
        ->not->toContain('AKIAIOSFODNN7EXAMPLE')
        ->toContain('[removed]');
});
