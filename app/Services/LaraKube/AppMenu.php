<?php

namespace App\Services\LaraKube;

use App\Models\Project;
use App\Models\Server;
use Native\Desktop\Facades\Menu;

class AppMenu
{
    /**
     * Builds and registers the comprehensive application menu.
     */
    public static function register(): void
    {
        try {
            $recentProjects = Project::query()->latest('id')->take(5)->get();
        } catch (\Throwable) {
            $recentProjects = collect();
        }

        try {
            $recentServers = Server::query()->latest('id')->take(5)->get();
        } catch (\Throwable) {
            $recentServers = collect();
        }

        $projectItems = [];
        foreach ($recentProjects as $project) {
            $name = basename($project->path) ?: "Project #{$project->id}";
            $projectItems[] = Menu::link(url("/projects/{$project->id}"), $name);
        }
        if (count($projectItems) === 0) {
            $projectItems[] = Menu::label('No recent projects');
        }
        $projectItems[] = Menu::separator();
        $projectItems[] = Menu::link(url('/projects'), 'View All Projects…');

        $serverFileItems = [];
        $serverClusterItems = [];
        foreach ($recentServers as $server) {
            $providerLabel = $server->role === 'dev' ? 'Dev Box' : ($server->provider ?: 'Server');
            $serverFileItems[] = Menu::link(url("/servers/{$server->id}"), "{$server->name} ({$providerLabel})");
            $serverClusterItems[] = Menu::link(url("/servers/{$server->id}"), "{$server->name} ({$server->status})");
        }
        if (count($serverFileItems) === 0) {
            $serverFileItems[] = Menu::label('No servers registered');
            $serverClusterItems[] = Menu::label('No servers registered');
        }
        $serverFileItems[] = Menu::separator();
        $serverFileItems[] = Menu::link(url('/servers'), 'View All Servers…');
        $serverClusterItems[] = Menu::separator();
        $serverClusterItems[] = Menu::link(url('/servers'), 'Manage All Servers…');

        $recentProjectsSubmenu = Menu::make(...$projectItems)->label('Open Recent Project');
        $recentServersFileSubmenu = Menu::make(...$serverFileItems)->label('Open Recent Server');
        $switchClusterSubmenu = Menu::make(...$serverClusterItems)->label('Switch Cluster Context');

        $fileMenu = Menu::make(
            Menu::link(url('/projects/create'), 'New Project…', 'CmdOrCtrl+N'),
            Menu::link(url('/servers/create'), 'New Server…', 'CmdOrCtrl+Shift+N'),
            Menu::separator(),
            $recentProjectsSubmenu,
            $recentServersFileSubmenu,
            Menu::separator(),
            Menu::link(url('/settings'), 'Settings…', 'CmdOrCtrl+,'),
            Menu::separator(),
            Menu::close('Close Window'),
        )->label('File');

        $editMenu = Menu::make(
            Menu::undo(),
            Menu::redo(),
            Menu::separator(),
            Menu::cut(),
            Menu::copy(),
            Menu::paste(),
            Menu::pasteAndMatchStyle(),
        )->label('Edit');

        $viewMenu = Menu::make(
            Menu::link(url('/dashboard'), 'Fleet Overview', 'CmdOrCtrl+0'),
            Menu::link(url('/servers'), 'Servers & Nodes', 'CmdOrCtrl+1'),
            Menu::link(url('/projects'), 'Projects Fleet', 'CmdOrCtrl+2'),
            Menu::link(url('/tools'), 'Cluster Tools', 'CmdOrCtrl+3'),
            Menu::link(url('/runs'), 'Activity & Terminal Runs', 'CmdOrCtrl+4'),
            Menu::link(url('/dev-boxes'), 'Dev Boxes & Workspaces', 'CmdOrCtrl+5'),
            Menu::link(url('/mail'), 'Mailboxes & Mail', 'CmdOrCtrl+6'),
            Menu::link(url('/plex'), 'Plex Commons', 'CmdOrCtrl+7'),
            Menu::link(url('/drive'), 'Drive & Cloud Storage', 'CmdOrCtrl+8'),
            Menu::link(url('/readiness'), 'CLI Diagnostics & Setup', 'CmdOrCtrl+9'),
            Menu::separator(),
            Menu::reload('Reload'),
            Menu::separator(),
            Menu::fullscreen(),
            Menu::devTools(),
        )->label('View');

        $clusterMenu = Menu::make(
            Menu::link(url('/dashboard'), 'Fleet Overview'),
            Menu::separator(),
            Menu::link(url('/servers'), 'Servers & Nodes'),
            Menu::link(url('/tools'), 'Cluster Tools'),
            Menu::link(url('/plex'), 'Plex Commons'),
            Menu::link(url('/mail'), 'Mail Infrastructure'),
            Menu::link(url('/drive'), 'Drive & Cloud Storage'),
            Menu::separator(),
            $switchClusterSubmenu,
            Menu::separator(),
            Menu::link(url('/readiness'), 'CLI & Cluster Diagnostics'),
        )->label('Cluster');

        $windowMenu = Menu::make(
            Menu::minimize(),
            Menu::close(),
        )->label('Window');

        $helpMenu = Menu::make(
            Menu::link('https://docs.larakube.app', 'LaraKube Documentation')->openInBrowser(),
            Menu::link('https://github.com/luchavez-technologies/larakube-desktop/discussions', 'Community & Discussions')->openInBrowser(),
            Menu::link('https://github.com/luchavez-technologies/larakube-desktop/issues', 'Report an Issue…')->openInBrowser(),
            Menu::separator(),
            Menu::link(url('/updates'), 'Check for Updates…'),
            Menu::separator(),
            Menu::link(url('/settings?action=uninstall'), 'Uninstall LaraKube Desktop…'),
        )->label('Help');

        $menus = [];
        if (PHP_OS_FAMILY === 'Darwin') {
            $appMenu = Menu::make(
                Menu::about(),
                Menu::separator(),
                Menu::link(url('/settings'), 'Preferences…', 'CmdOrCtrl+,'),
                Menu::separator(),
                Menu::hide(),
                Menu::separator(),
                Menu::quit(),
            )->label(config('app.name', 'LaraKube'));

            $menus[] = $appMenu;
        }

        $menus[] = $fileMenu;
        $menus[] = $editMenu;
        $menus[] = $viewMenu;
        $menus[] = $clusterMenu;
        $menus[] = $windowMenu;
        $menus[] = $helpMenu;

        try {
            Menu::create(...$menus);
        } catch (\Throwable) {
            // Running in test or CLI environment without Electron runtime
        }
    }
}
