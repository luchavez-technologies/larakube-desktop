<?php

namespace App\Services\LaraKube;

use Illuminate\Support\Facades\Process;

/**
 * Whether dnsmasq already wildcards a TLD to 127.0.0.1 on this machine —
 * mirroring the CLI's own InteractsWithTrust::isDnsmasqConfigured() check.
 * When it does, a local `up` never touches /etc/hosts or `sudo` for that TLD
 * at all (see InteractsWithHosts::ensureHostsAreSet() /
 * syncClusterServiceHosts() in the CLI), so CliRunner::needsElevation() uses
 * this to skip the GUI password prompt on runs that would never need it.
 */
class LocalDnsCoverage
{
    public function covers(string $tld): bool
    {
        if (PHP_OS_FAMILY === 'Darwin') {
            $brewPrefix = trim(Process::run('brew --prefix')->output());
            $prefixes = array_values(array_unique(array_filter([$brewPrefix, '/opt/homebrew', '/usr/local'])));
            $hasConf = false;

            foreach ($prefixes as $prefix) {
                if (file_exists("{$prefix}/etc/dnsmasq.d/larakube.conf")) {
                    $hasConf = true;
                    break;
                }
            }

            if (! $hasConf || ! file_exists("/etc/resolver/{$tld}")) {
                return false;
            }

            return str_contains(Process::run("dscacheutil -q host -a name larakube-probe.{$tld}")->output(), '127.0.0.1');
        }

        if (PHP_OS_FAMILY === 'Linux') {
            if (! file_exists('/etc/dnsmasq.d/larakube.conf')) {
                return false;
            }

            return str_contains(Process::run("getent hosts larakube-probe.{$tld}")->output(), '127.0.0.1');
        }

        // Windows: dnsmasq is never the mechanism — hosts sync works through
        // WSL/Windows paths that CliRunner handles separately.
        return false;
    }
}
