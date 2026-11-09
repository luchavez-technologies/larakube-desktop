<?php

use App\Enums\RunStatus;
use App\Mcp\Servers\LaraKubeDesktopServer;
use App\Mcp\Tools\GetRunStatusTool;
use App\Models\Run;

test('reports a finished run', function () {
    $run = Run::create(['label' => 'Up shop (local)', 'command' => ['larakube', 'up', 'local']]);
    $run->update(['status' => RunStatus::Succeeded, 'exit_code' => 0, 'output' => 'done']);

    $response = LaraKubeDesktopServer::tool(GetRunStatusTool::class, ['run_id' => $run->id]);

    $response->assertOk()->assertSee('succeeded');
});

test('errors cleanly when the run does not exist', function () {
    $response = LaraKubeDesktopServer::tool(GetRunStatusTool::class, ['run_id' => 999999]);

    $response->assertHasErrors(['No run found']);
});
