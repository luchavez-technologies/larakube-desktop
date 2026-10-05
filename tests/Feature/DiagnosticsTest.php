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

test('the report includes the end of the Desktop program log when there is one', function () {
    $data = sys_get_temp_dir().'/larakube-userdata-'.bin2hex(random_bytes(4));
    mkdir($data.'/logs', 0777, true);
    file_put_contents($data.'/logs/main.log', "2026-10-05T10:00:00Z [log] Process [run-9] spawned!\n2026-10-05T10:00:30Z [error] Process [run-10] failed to start within timeout period\n");
    putenv("NATIVEPHP_USER_DATA_PATH={$data}");
    Process::fake(['*' => Process::result(exitCode: 1)]);

    $report = $this->getJson('/diagnostics')->assertOk()->json('report');

    putenv('NATIVEPHP_USER_DATA_PATH');

    expect($report)->toContain('failed to start within timeout period')
        ->toContain("Data folder: {$data}");
});
