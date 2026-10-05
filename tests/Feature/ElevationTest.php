<?php

use App\Services\Elevation;
use Illuminate\Support\Facades\Process;

test('on Windows there is nothing to grant, because the distro user already has passwordless sudo', function () {
    Process::fake();
    $elevation = new Elevation(windows: true);

    expect($elevation->method())->toBe('distro')
        ->and($elevation->grant())->toBeTrue()
        ->and($elevation->revoke())->toBeTrue();

    Process::assertNothingRan();
});
