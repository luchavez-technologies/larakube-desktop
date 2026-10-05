<?php

use App\Http\Controllers\BackupController;
use App\Http\Controllers\CloudAuthController;
use App\Http\Controllers\ClusterAccessController;
use App\Http\Controllers\ClusterToolController;
use App\Http\Controllers\CompanionController;
use App\Http\Controllers\ContextController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DevBoxController;
use App\Http\Controllers\DiagnosticsController;
use App\Http\Controllers\LocalSetupController;
use App\Http\Controllers\OpenExternalController;
use App\Http\Controllers\PlexController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ReadinessController;
use App\Http\Controllers\RunController;
use App\Http\Controllers\ServerController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\ToolInstallController;
use App\Http\Controllers\UpdatesController;
use App\Http\Controllers\WorkspaceController;
use App\Http\Controllers\WslSetupController;
use Illuminate\Support\Facades\Route;

Route::get('/', [DashboardController::class, 'index'])->name('home');
Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

Route::get('/readiness', [ReadinessController::class, 'show'])->name('readiness');
Route::post('/setup/cli/update', [ToolInstallController::class, 'updateCli'])->name('setup.cli.update');
Route::post('/setup/tools/{tool}/install', [ToolInstallController::class, 'store'])->name('setup.tools.install');
Route::get('/setup/tools/{tool}/status', [ReadinessController::class, 'toolStatus'])->name('setup.tools.status');
Route::post('/setup/wsl/{step}', [WslSetupController::class, 'store'])->whereIn('step', ['enable', 'download', 'import', 'reset'])->name('setup.wsl');
Route::post('/setup/local', [LocalSetupController::class, 'store'])->name('setup.local');
Route::post('/setup/usage', [ReadinessController::class, 'setUsage'])->name('setup.usage');
Route::post('/setup/cli/channel', [ReadinessController::class, 'setChannel'])->name('setup.cli.channel');
Route::post('/setup/cloud/aws', [CloudAuthController::class, 'saveAws'])->name('setup.cloud.aws');
Route::post('/setup/cloud/gcp/login', [CloudAuthController::class, 'loginGcp'])->name('setup.cloud.gcp.login');
Route::get('/setup/cloud/gcp/login/{run}', [CloudAuthController::class, 'gcpLoginStatus'])->name('setup.cloud.gcp.login.status');
Route::post('/setup/cloud/gcp/login/{run}/code', [CloudAuthController::class, 'gcpLoginCode'])->name('setup.cloud.gcp.login.code');
Route::get('/setup/cloud/gcp/projects', [CloudAuthController::class, 'gcpProjects'])->name('setup.cloud.gcp.projects');
Route::post('/setup/cloud/gcp/project', [CloudAuthController::class, 'setGcpProject'])->name('setup.cloud.gcp.project');

Route::get('/servers', [ServerController::class, 'index'])->name('servers.index');
Route::get('/servers/create', [ServerController::class, 'create'])->name('servers.create');
Route::post('/servers', [ServerController::class, 'store'])->name('servers.store');

Route::pattern('server', '[a-z0-9][a-z0-9-]*');
Route::pattern('tool', '[a-z][a-z0-9-]*');

Route::get('/servers/health', [ServerController::class, 'health'])->name('servers.health');
Route::get('/servers/{server}', [ServerController::class, 'show'])->name('servers.show');
Route::delete('/servers/{server}', [ServerController::class, 'destroy'])->name('servers.destroy');
Route::post('/servers/{server}/restart', [ServerController::class, 'restart'])->name('servers.restart');
Route::post('/servers/{server}/dns', [ServerController::class, 'connectDomain'])->name('servers.dns');
Route::post('/servers/{server}/tls', [ServerController::class, 'enableSsl'])->name('servers.tls');
Route::post('/servers/{server}/plex/init', [PlexController::class, 'initServer'])->name('servers.plex.init');
Route::post('/servers/{server}/plex/start', [PlexController::class, 'startServer'])->name('servers.plex.start');
Route::post('/servers/{server}/plex/stop', [PlexController::class, 'stopServer'])->name('servers.plex.stop');
Route::post('/servers/{server}/backups/setup', [BackupController::class, 'setup'])->name('servers.backups.setup');
Route::post('/servers/{server}/backups/schedule', [BackupController::class, 'schedule'])->name('servers.backups.schedule');
Route::post('/servers/{server}/backups/unschedule', [BackupController::class, 'unschedule'])->name('servers.backups.unschedule');
Route::post('/servers/{server}/backups/run', [BackupController::class, 'run'])->name('servers.backups.run');
Route::post('/servers/{server}/backups/check', [BackupController::class, 'check'])->name('servers.backups.check');
Route::post('/servers/{server}/backups/restore', [BackupController::class, 'restore'])->name('servers.backups.restore');
Route::post('/servers/{server}/backups/prune', [BackupController::class, 'prune'])->name('servers.backups.prune');
Route::post('/servers/{server}/backups/recovery-card', [BackupController::class, 'recoveryCard'])->name('servers.backups.recovery-card');
Route::post('/servers/{server}/access/grant', [ClusterAccessController::class, 'grant'])->name('servers.access.grant');
Route::post('/servers/{server}/access/revoke', [ClusterAccessController::class, 'revoke'])->name('servers.access.revoke');

Route::get('/dev-boxes', [DevBoxController::class, 'index'])->name('devboxes.index');
Route::get('/dev-boxes/create', [DevBoxController::class, 'create'])->name('devboxes.create');
Route::post('/dev-boxes', [DevBoxController::class, 'store'])->name('devboxes.store');
Route::get('/dev-boxes/{box}', [DevBoxController::class, 'show'])->name('devboxes.show');
Route::post('/dev-boxes/{box}/update-cli', [DevBoxController::class, 'updateCli'])->name('devboxes.update-cli');
Route::get('/dev-boxes/{box}/projects/{project}', [DevBoxController::class, 'showProject'])->where('project', '[a-z0-9][a-z0-9-]*')->name('devboxes.projects.show');
Route::post('/dev-boxes/{box}/projects/{project}/{action}', [DevBoxController::class, 'operate'])->where('project', '[a-z0-9][a-z0-9-]*')->where('action', 'up|down|start|stop')->name('devboxes.operate');
Route::get('/dev-boxes/{box}/projects/{project}/share-domain', [DevBoxController::class, 'shareDomainPage'])->where('project', '[a-z0-9][a-z0-9-]*')->name('devboxes.share-domain-page');
Route::post('/dev-boxes/{box}/domains', [DevBoxController::class, 'domains'])->name('devboxes.domains');
Route::post('/dev-boxes/{box}/projects/{project}/share-domain', [DevBoxController::class, 'shareDomain'])->where('project', '[a-z0-9][a-z0-9-]*')->name('devboxes.share-domain');
Route::delete('/dev-boxes/{box}/projects/{project}/share-domain', [DevBoxController::class, 'removeDomain'])->where('project', '[a-z0-9][a-z0-9-]*')->name('devboxes.remove-domain');

Route::pattern('box', '[a-z0-9][a-z0-9-]*');
Route::pattern('workspace', '[a-z0-9][a-z0-9-]*');
Route::get('/workspaces', [WorkspaceController::class, 'index'])->name('workspaces.index');
Route::post('/workspaces', [WorkspaceController::class, 'store'])->name('workspaces.store');
Route::post('/workspaces/{workspace}/suspend', [WorkspaceController::class, 'suspend'])->name('workspaces.suspend');
Route::post('/workspaces/{workspace}/resume', [WorkspaceController::class, 'resume'])->name('workspaces.resume');
Route::post('/workspaces/{workspace}/open', [WorkspaceController::class, 'open'])->name('workspaces.open');
Route::delete('/workspaces/{workspace}', [WorkspaceController::class, 'destroy'])->name('workspaces.destroy');

Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');
Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
Route::get('/projects/create', [ProjectController::class, 'create'])->name('projects.create');
Route::post('/projects/create/folder', [ProjectController::class, 'chooseFolder'])->name('projects.choose-folder');
Route::post('/projects/create', [ProjectController::class, 'scaffold'])->name('projects.scaffold');
Route::post('/projects/create/dev-box', [ProjectController::class, 'scaffoldOnDevBox'])->name('projects.scaffold-dev-box');
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
Route::get('/projects/{project}/services', [ProjectController::class, 'services'])->name('projects.services');
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

Route::get('/diagnostics', DiagnosticsController::class)->name('diagnostics');
Route::get('/updates', [UpdatesController::class, 'status'])->name('updates.status');
Route::post('/updates/check', [UpdatesController::class, 'check'])->name('updates.check');
Route::post('/updates/install', [UpdatesController::class, 'install'])->name('updates.install');
Route::get('/settings', [SettingsController::class, 'show'])->name('settings.show');
Route::post('/settings', [SettingsController::class, 'update'])->name('settings.update');
Route::post('/settings/bridge/{agent}', [SettingsController::class, 'bridge'])->name('settings.bridge');

Route::post('/open', OpenExternalController::class)->name('open');

Route::get('/runs', [RunController::class, 'index'])->name('runs.index');
Route::get('/runs/{run}', [RunController::class, 'show'])->name('runs.show');
Route::post('/runs/{run}/cancel', [RunController::class, 'cancel'])->name('runs.cancel');
