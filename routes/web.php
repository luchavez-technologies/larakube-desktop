<?php

use App\Http\Controllers\ClusterToolController;
use App\Http\Controllers\OpenExternalController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ReadinessController;
use App\Http\Controllers\RunController;
use App\Http\Controllers\ServerController;
use App\Http\Controllers\ToolInstallController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/readiness')->name('home');

Route::get('/readiness', [ReadinessController::class, 'show'])->name('readiness');
Route::post('/setup/tools/{tool}/install', [ToolInstallController::class, 'store'])->name('setup.tools.install');

Route::get('/servers', [ServerController::class, 'index'])->name('servers.index');
Route::get('/servers/create', [ServerController::class, 'create'])->name('servers.create');
Route::post('/servers', [ServerController::class, 'store'])->name('servers.store');

Route::pattern('server', '[a-z0-9][a-z0-9-]*');
Route::pattern('tool', '[a-z][a-z0-9-]*');

Route::get('/servers/{server}', [ServerController::class, 'show'])->name('servers.show');
Route::delete('/servers/{server}', [ServerController::class, 'destroy'])->name('servers.destroy');
Route::post('/servers/{server}/dns', [ServerController::class, 'connectDomain'])->name('servers.dns');
Route::post('/servers/{server}/tls', [ServerController::class, 'enableSsl'])->name('servers.tls');

Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');
Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
Route::get('/projects/create', [ProjectController::class, 'create'])->name('projects.create');
Route::post('/projects/create/folder', [ProjectController::class, 'chooseFolder'])->name('projects.choose-folder');
Route::post('/projects/create', [ProjectController::class, 'scaffold'])->name('projects.scaffold');
Route::get('/projects/{project}', [ProjectController::class, 'show'])->name('projects.show');
Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])->name('projects.destroy');
Route::post('/projects/{project}/init', [ProjectController::class, 'init'])->name('projects.init');
Route::post('/projects/{project}/host', [ProjectController::class, 'host'])->name('projects.host');
Route::post('/projects/{project}/deploy', [ProjectController::class, 'deploy'])->name('projects.deploy');

Route::get('/tools', [ClusterToolController::class, 'entry'])->name('tools');
Route::get('/servers/{server}/tools', [ClusterToolController::class, 'index'])->name('servers.tools.index');
Route::post('/servers/{server}/tools/refresh', [ClusterToolController::class, 'refresh'])->name('servers.tools.refresh');
Route::get('/servers/{server}/tools/{tool}', [ClusterToolController::class, 'show'])->name('servers.tools.show');
Route::post('/servers/{server}/tools/{tool}', [ClusterToolController::class, 'store'])->name('servers.tools.store');
Route::delete('/servers/{server}/tools/{tool}', [ClusterToolController::class, 'destroy'])->name('servers.tools.destroy');

Route::post('/open', OpenExternalController::class)->name('open');

Route::get('/runs', [RunController::class, 'index'])->name('runs.index');
Route::get('/runs/{run}', [RunController::class, 'show'])->name('runs.show');
Route::post('/runs/{run}/cancel', [RunController::class, 'cancel'])->name('runs.cancel');
