<?php

use App\Services\SshKeyInspector;

test('SshKeyInspector detects and resolves keys from HOME or hostProfile fallback', function (): void {
    $tempHome = sys_get_temp_dir().'/larakube-ssh-'.bin2hex(random_bytes(4));
    mkdir($tempHome.'/.ssh', 0700, true);
    file_put_contents($tempHome.'/.ssh/id_ed25519', 'dummy-key');

    $prevEnvHome = getenv('HOME');
    $prevServerHome = $_SERVER['HOME'] ?? null;

    try {
        putenv('HOME');
        $_SERVER['HOME'] = $tempHome;

        $inspector = new SshKeyInspector;

        expect($inspector->detectCommonKeys())->toBe(['~/.ssh/id_ed25519'])
            ->and($inspector->resolvePath('~/.ssh/id_ed25519'))->toBe($tempHome.'/.ssh/id_ed25519');
    } finally {
        @unlink($tempHome.'/.ssh/id_ed25519');
        @rmdir($tempHome.'/.ssh');
        @rmdir($tempHome);

        if ($prevEnvHome === false) {
            putenv('HOME');
        } else {
            putenv('HOME='.$prevEnvHome);
        }

        if ($prevServerHome === null) {
            unset($_SERVER['HOME']);
        } else {
            $_SERVER['HOME'] = $prevServerHome;
        }
    }
});
