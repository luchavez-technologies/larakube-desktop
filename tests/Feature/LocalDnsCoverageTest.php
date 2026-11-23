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

function hostsFileWith(string $content): string
{
    $path = tempnam(sys_get_temp_dir(), 'hosts');
    file_put_contents($path, $content);

    return $path;
}

test('a leftover companions block for this project needs cleanup', function (): void {
    $file = hostsFileWith("127.0.0.1 localhost\n# LaraKube: cloud-companions\n1.2.3.4 pgadmin.test\n");

    expect((new LocalDnsCoverage)->hostsNeedCleanup('cloud', $file))->toBeTrue();
    unlink($file);
});

test('a leftover shared-services block needs cleanup for any project', function (): void {
    $file = hostsFileWith("# LaraKube: larakube-shared\n1.2.3.4 mailpit.test\n");

    expect((new LocalDnsCoverage)->hostsNeedCleanup(null, $file))->toBeTrue();
    unlink($file);
});

test('another project\'s companions block, or a similar name, needs no cleanup', function (): void {
    $file = hostsFileWith("# LaraKube: blog-companions\n# LaraKube: cloud-companions-old\n# LaraKube: cloud\n");

    expect((new LocalDnsCoverage)->hostsNeedCleanup('cloud', $file))->toBeFalse();
    unlink($file);
});

test('an unreadable hosts file needs no cleanup', function (): void {
    expect((new LocalDnsCoverage)->hostsNeedCleanup('cloud', '/nonexistent/hosts'))->toBeFalse();
});
