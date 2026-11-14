<?php

namespace App\Services\LaraKube\Tools;

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\CliInstaller;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;

abstract class AbstractDirectCliTool extends AbstractCliTool
{
    public function required(): bool
    {
        return true;
    }

    protected function targetName(): string
    {
        return $this->label();
    }

    protected function runEnvironment(): string
    {
        return 'local';
    }

    /**
     * @return list<string>
     */
    abstract protected function cliCommand(string $channel): array;

    abstract protected function downloadUrl(CliInstaller $installer, string $channel): string;

    /**
     * @return array{success: bool, path: ?string, error: ?string}
     */
    abstract protected function executeInstall(CliInstaller $installer, string $channel): array;

    public function dispatchInstall(
        CliRunner $runner,
        CliInstaller $installer,
        ReadinessCheck $readiness,
        string $channel,
        string $verb = 'Install',
    ): Run {
        $name = $this->targetName();
        $url = $this->downloadUrl($installer, $channel);

        $run = Run::create([
            'label' => "{$verb} {$name} ({$channel})",
            'kind' => RunKind::InstallTool,
            'subject' => $this->slug(),
            'target_type' => 'tool',
            'target_name' => $name,
            'tool' => $this->slug(),
            'environment' => $this->runEnvironment(),
            'command' => $this->cliCommand($channel),
            'status' => RunStatus::Running,
            'output' => "Downloading {$name} ({$channel} channel) from {$url}...\n",
        ]);

        $result = $this->executeInstall($installer, $channel);
        $readiness->forget($this->slug());

        if ($result['success']) {
            $run->update([
                'status' => RunStatus::Succeeded,
                'finished_at' => now(),
                'output' => $run->output."✓ {$name} installed successfully to {$result['path']}.\n",
            ]);
        } else {
            $run->update([
                'status' => RunStatus::Failed,
                'finished_at' => now(),
                'output' => $run->output."✗ Failed to install {$name}: {$result['error']}\n",
            ]);
        }

        return $run;
    }
}
