<?php

namespace App\Services\LaraKube\Tools;

use App\Contracts\CliToolContract;
use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;

abstract class AbstractCliTool implements CliToolContract
{
    public function binary(): string
    {
        return $this->slug();
    }

    public function required(): bool
    {
        return false;
    }

    public function localOnly(): bool
    {
        return false;
    }

    public function windowsOnly(): bool
    {
        return false;
    }

    public function provider(): ?string
    {
        return null;
    }

    /**
     * @return list<string>
     */
    public function versionArgs(): array
    {
        return ['--version'];
    }

    public function runsOnWindowsHost(): bool
    {
        return false;
    }

    public function canInstall(): bool
    {
        return true;
    }

    /**
     * On Windows the larakube-ubuntu image bundles this tool (it serves
     * project work, and projects live in the distro), so Setup lists it as
     * bundled instead of offering an install.
     */
    public function bundledInWslImage(): bool
    {
        return false;
    }

    public function isSupported(ToolLocator $locator): bool
    {
        if ($this->bundledInWslImage() && $locator->isWindows()) {
            return false;
        }

        return ! $this->windowsOnly() || $locator->isWindows();
    }

    public function isInstallable(ToolLocator $locator): bool
    {
        return $this->canInstall();
    }

    public function environment(ToolLocator $locator): ?string
    {
        if (! $locator->isWindows()) {
            return null;
        }

        return $this->runsOnWindowsHost() ? 'windows' : 'wsl';
    }

    /**
     * @return array{slug: string, label: string, purpose: string, required: bool, installable: bool, localOnly: bool, environment: ?string}
     */
    public function toCatalogEntry(ToolLocator $locator): array
    {
        return [
            'slug' => $this->slug(),
            'label' => $this->label(),
            'purpose' => $this->purpose(),
            'required' => $this->required(),
            'localOnly' => $this->localOnly(),
            'environment' => $this->environment($locator),
            'installable' => $this->isInstallable($locator),
        ];
    }

    public function locate(ToolLocator $locator): ?string
    {
        if ($locator->isWindows() && ! $locator->hasExplicitDirectories() && $this->runsOnWindowsHost()) {
            return $locator->nativeWindowsToolPath($this->binary());
        }

        return $locator->find($this->binary());
    }

    /**
     * @return list<string>
     */
    public function installArguments(bool $update = false): array
    {
        $args = ['setup', "--tools={$this->slug()}"];

        if ($update) {
            $args[] = '--update';
        }

        return $args;
    }

    public function managedBySetup(): bool
    {
        return false;
    }

    /**
     * A corrupted or broken copy: the CLI's `setup:reinstall` replaces it
     * through whoever owns it (Homebrew, the CLI's own download, the SDK's
     * updater). Tools `setup` does not manage fall back to their update.
     *
     * @return list<string>
     */
    public function reinstallArguments(): array
    {
        return $this->managedBySetup()
            ? ['setup:reinstall', $this->slug()]
            : $this->installArguments(update: true);
    }

    public function dispatchInstall(
        CliRunner $runner,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        string $channel,
        string $verb = 'Install',
    ): Run {
        return $runner->start(
            label: "{$verb} {$this->label()}",
            arguments: match ($verb) {
                'Install' => $this->installArguments(),
                'Reinstall' => $this->reinstallArguments(),
                default => $this->installArguments(update: true),
            },
            kind: RunKind::InstallTool,
            subject: $this->slug(),
            targetType: 'tool',
            targetName: $this->label(),
            tool: $this->slug(),
            environment: 'local',
        );
    }
}
