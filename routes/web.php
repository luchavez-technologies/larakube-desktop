<?php

use App\Http\Controllers\CloudAuthController;
use App\Http\Controllers\ClusterAccessController;
use App\Http\Controllers\ClusterToolController;
use App\Http\Controllers\CompanionController;
use App\Http\Controllers\ContextController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\LocalSetupController;
use App\Http\Controllers\OpenExternalController;
use App\Http\Controllers\PlexController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ReadinessController;
use App\Http\Controllers\RunController;
use App\Http\Controllers\ServerController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\ToolInstallController;
use Illuminate\Support\Facades\Route;

Route::get('/', [DashboardController::class, 'index'])->name('home');
Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

Route::get('/readiness', [ReadinessController::class, 'show'])->name('readiness');
Route::post('/setup/tools/{tool}/install', [ToolInstallController::class, 'store'])->name('setup.tools.install');
Route::post('/setup/local', [LocalSetupController::class, 'store'])->name('setup.local');
Route::post('/setup/usage', [ReadinessController::class, 'setUsage'])->name('setup.usage');
Route::post('/setup/cli/channel', [ReadinessController::class, 'setChannel'])->name('setup.cli.channel');
Route::post('/setup/cloud/aws', [CloudAuthController::class, 'saveAws'])->name('setup.cloud.aws');
Route::post('/setup/cloud/gcp/login', [CloudAuthController::class, 'loginGcp'])->name('setup.cloud.gcp.login');
Route::post('/setup/cloud/gcp/project', [CloudAuthController::class, 'setGcpProject'])->name('setup.cloud.gcp.project');

Route::get('/servers', [ServerController::class, 'index'])->name('servers.index');
Route::get('/servers/create', [ServerController::class, 'create'])->name('servers.create');
Route::post('/servers', [ServerController::class, 'store'])->name('servers.store');

Route::pattern('server', '[a-z0-9][a-z0-9-]*');
Route::pattern('tool', '[a-z][a-z0-9-]*');

Route::get('/servers/{server}', [ServerController::class, 'show'])->name('servers.show');
Route::delete('/servers/{server}', [ServerController::class, 'destroy'])->name('servers.destroy');
Route::post('/servers/{server}/dns', [ServerController::class, 'connectDomain'])->name('servers.dns');
Route::post('/servers/{server}/tls', [ServerController::class, 'enableSsl'])->name('servers.tls');
Route::post('/servers/{server}/plex/init', [PlexController::class, 'initServer'])->name('servers.plex.init');
Route::post('/servers/{server}/plex/start', [PlexController::class, 'startServer'])->name('servers.plex.start');
Route::post('/servers/{server}/plex/stop', [PlexController::class, 'stopServer'])->name('servers.plex.stop');
Route::post('/servers/{server}/access/grant', [ClusterAccessController::class, 'grant'])->name('servers.access.grant');
Route::post('/servers/{server}/access/revoke', [ClusterAccessController::class, 'revoke'])->name('servers.access.revoke');

Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');
Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
Route::get('/projects/create', [ProjectController::class, 'create'])->name('projects.create');
Route::post('/projects/create/folder', [ProjectController::class, 'chooseFolder'])->name('projects.choose-folder');
Route::post('/projects/create', [ProjectController::class, 'scaffold'])->name('projects.scaffold');
Route::post('/projects/local/stop-all', [ProjectController::class, 'stopAll'])->name('projects.stop-all');
Route::post('/projects/local/down-all', [ProjectController::class, 'downAll'])->name('projects.down-all');
Route::get('/projects/{project}', [ProjectController::class, 'show'])->name('projects.show');
Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])->name('projects.destroy');
Route::post('/projects/{project}/init', [ProjectController::class, 'init'])->name('projects.init');
Route::post('/projects/{project}/link', [ProjectController::class, 'link'])->name('projects.link');
Route::post('/projects/{project}/host', [ProjectController::class, 'host'])->name('projects.host');
Route::post('/projects/{project}/retry', [ProjectController::class, 'retry'])->name('projects.retry');
Route::post('/projects/{project}/editor', [ProjectController::class, 'openInEditor'])->name('projects.editor');
Route::post('/projects/{project}/deploy', [ProjectController::class, 'deploy'])->name('projects.deploy');
Route::post('/projects/{project}/up', [ProjectController::class, 'up'])->name('projects.up');
Route::post('/projects/{project}/down', [ProjectController::class, 'down'])->name('projects.down');
Route::post('/projects/{project}/start', [ProjectController::class, 'start'])->name('projects.start');
Route::post('/projects/{project}/stop', [ProjectController::class, 'stop'])->name('projects.stop');
Route::post('/projects/{project}/tld', [ProjectController::class, 'tld'])->name('projects.tld');
Route::post('/projects/{project}/plex/join', [PlexController::class, 'joinProject'])->name('projects.plex.join');
Route::post('/projects/{project}/plex/leave', [PlexController::class, 'leaveProject'])->name('projects.plex.leave');

Route::get('/tools', [ClusterToolController::class, 'entry'])->name('tools');
Route::get('/servers/{server}/tools', [ClusterToolController::class, 'index'])->name('servers.tools.index');
Route::get('/servers/{server}/check-dns', [ClusterToolController::class, 'checkDns'])->name('servers.tools.check-dns');
Route::post('/servers/{server}/tools/refresh', [ClusterToolController::class, 'refresh'])->name('servers.tools.refresh');
Route::get('/servers/{server}/tools/{tool}', [ClusterToolController::class, 'show'])->name('servers.tools.show');
Route::post('/servers/{server}/tools/{tool}', [ClusterToolController::class, 'store'])->name('servers.tools.store');
Route::delete('/servers/{server}/tools/{tool}', [ClusterToolController::class, 'destroy'])->name('servers.tools.destroy');

Route::post('/companions/add', [CompanionController::class, 'add'])->name('companions.add');
Route::post('/companions/remove', [CompanionController::class, 'remove'])->name('companions.remove');
Route::post('/companions/start', [CompanionController::class, 'start'])->name('companions.start');
Route::post('/companions/stop', [CompanionController::class, 'stop'])->name('companions.stop');

Route::match(['get', 'post'], '/context/pick-file', [ContextController::class, 'pickFile'])->name('context.pick-file');
Route::post('/context/import', [ContextController::class, 'import'])->name('context.import');
Route::post('/context/switch', [ContextController::class, 'switchContext'])->name('context.switch');
Route::post('/context/backup', [ContextController::class, 'backup'])->name('context.backup');
Route::post('/context/restore', [ContextController::class, 'restore'])->name('context.restore');
Route::post('/context/remove', [ContextController::class, 'remove'])->name('context.remove');

Route::get('/settings', [SettingsController::class, 'show'])->name('settings.show');
Route::post('/settings', [SettingsController::class, 'update'])->name('settings.update');
Route::post('/settings/bridge/{agent}', [SettingsController::class, 'bridge'])->name('settings.bridge');

Route::post('/open', OpenExternalController::class)->name('open');

Route::get('/runs', [RunController::class, 'index'])->name('runs.index');
Route::get('/runs/{run}', [RunController::class, 'show'])->name('runs.show');
Route::post('/runs/{run}/cancel', [RunController::class, 'cancel'])->name('runs.cancel');
