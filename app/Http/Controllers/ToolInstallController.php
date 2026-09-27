<?php

namespace App\Http\Controllers;

use App\Enums\RunKind;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ReadinessCheck;
use Illuminate\Http\RedirectResponse;

class ToolInstallController extends Controller
{
    public function store(string $tool, CliRunner $runner): RedirectResponse
    {
        $definition = ReadinessCheck::TOOLS[$tool] ?? null;

        abort_if($definition === null || ! $definition['installable'], 404);

        $run = $runner->start("Install {$definition['label']}", ['setup', "--tools={$tool}"], kind: RunKind::InstallTool, subject: $tool);

        return to_route('runs.show', $run);
    }
}
