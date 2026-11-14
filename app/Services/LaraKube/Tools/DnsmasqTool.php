<?php

namespace App\Services\LaraKube\Tools;

use App\Services\LaraKube\ToolLocator;

class DnsmasqTool extends AbstractCliTool
{
    public function slug(): string
    {
        return 'dnsmasq';
    }

    public function label(): string
    {
        return 'dnsmasq';
    }

    public function purpose(): string
    {
        return 'Wildcard local-domain DNS so project hosts resolve automatically, without a sudo prompt on every `up`.';
    }

    public function localOnly(): bool
    {
        return true;
    }

    public function isInstallable(ToolLocator $locator): bool
    {
        // dnsmasq wildcards local DNS via the host's own resolver — Windows
        // has no such mechanism (it resolves via the Windows hosts file
        // instead, see InteractsWithHosts::ensureWindowsHostsAreSet() in the
        // CLI), so `larakube trust` is a no-op for it there.
        return PHP_OS_FAMILY !== 'Windows';
    }

    public function installArguments(bool $update = false): array
    {
        // dnsmasq's install (`trust`) is already idempotent — re-running
        // the exact same command is the update.
        return ['trust'];
    }
}
