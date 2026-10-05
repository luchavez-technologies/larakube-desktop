<?php

use App\Models\Project;
use App\Services\LaraKube\ToolLocator;
use Native\Desktop\Facades\Shell;

test('a project folder is shown in the file manager', function () {
    $project = Project::create(['path' => '/Users/mia/Codes/shop']);
    app()->instance(ToolLocator::class, new ToolLocator(windows: false));

    Shell::shouldReceive('showInFolder')->once()->with('/Users/mia/Codes/shop');

    $this->post("/projects/{$project->id}/folder")->assertRedirect();
});

test('on Windows a project inside the distro is shown through its network share', function () {
    $project = Project::create(['path' => '/home/larakube/projects/shop']);
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));

    Shell::shouldReceive('showInFolder')->once()->with('\\\\wsl.localhost\\larakube-ubuntu\\home\\larakube\\projects\\shop');

    $this->post("/projects/{$project->id}/folder")->assertRedirect();
});

test('the log folder is shown, preferring the program log itself', function () {
    $data = sys_get_temp_dir().'/larakube-folder-'.bin2hex(random_bytes(4));
    mkdir($data.'/logs', 0777, true);
    file_put_contents($data.'/logs/main.log', 'x');
    putenv("NATIVEPHP_USER_DATA_PATH={$data}");

    Shell::shouldReceive('showInFolder')->once()->with($data.DIRECTORY_SEPARATOR.'logs'.DIRECTORY_SEPARATOR.'main.log');

    $this->postJson('/diagnostics/folder')->assertOk();

    putenv('NATIVEPHP_USER_DATA_PATH');
});

test('there is no log folder to show outside a packaged app', function () {
    putenv('NATIVEPHP_USER_DATA_PATH');

    $this->postJson('/diagnostics/folder')->assertNotFound();
});
