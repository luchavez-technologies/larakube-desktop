<?php

namespace App\Contracts;

use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;

interface CliToolContract
{
    public function slug(): string;

    public function binary(): string;

    public function label(): string;

    public function purpose(): string;

    public function required(): bool;

    public function localOnly(): bool;

    public function windowsOnly(): bool;

    public function provider(): ?string;

    /**
     * @return list<string>
     */
    public function versionArgs(): array;

    public function runsOnWindowsHost(): bool;

    public function canInstall(): bool;

    public function isSupported(ToolLocator $locator): bool;

    public function isInstallable(ToolLocator $locator): bool;

    public function environment(ToolLocator $locator): ?string;

    /**
     * @return array{slug: string, label: string, purpose: string, required: bool, installable: bool, localOnly: bool, environment: ?string}
     */
    public function toCatalogEntry(ToolLocator $locator): array;

    public function locate(ToolLocator $locator): ?string;

    /**
     * @return list<string>
     */
    public function installArguments(bool $update = false): array;

    public function dispatchInstall(
        CliRunner $runner,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        string $channel,
        string $verb = 'Install',
    ): Run;
}
