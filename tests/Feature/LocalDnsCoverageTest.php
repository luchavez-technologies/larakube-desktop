<?php

use App\Services\LaraKube\LocalDnsCoverage;
use Illuminate\Support\Facades\Process;

/**
 * Only the "not covered yet" path is unit-tested here, mirroring the CLI's
 * own InteractsWithTrustProcessTest: covers() reads real system paths
 * (/etc/resolver, /etc/dnsmasq.d) that a test can't write to without sudo,
 * so they are naturally absent on a dev/CI machine and the check reports
 * false — exactly the state this class exists to detect accurately.
 */
test('reports no coverage when dnsmasq has not been configured for the TLD', function () {
    Process::fake(['*brew --prefix*' => Process::result('/opt/homebrew'), '*' => Process::result()]);

    expect((new LocalDnsCoverage)->covers('test'))->toBeFalse();
});
