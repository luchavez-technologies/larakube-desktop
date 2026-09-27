<?php

use App\Http\Controllers\ReadinessController;
use App\Http\Controllers\RunController;
use App\Http\Controllers\ServerController;
use App\Http\Controllers\ToolInstallController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/readiness')->name('home');

Route::get('/readiness', [ReadinessController::class, 'show'])->name('readiness');
Route::post('/tools/{tool}/install', [ToolInstallController::class, 'store'])->name('tools.install');

Route::get('/servers', [ServerController::class, 'index'])->name('servers.index');
Route::get('/servers/create', [ServerController::class, 'create'])->name('servers.create');
Route::post('/servers', [ServerController::class, 'store'])->name('servers.store');
Route::get('/servers/{server}', [ServerController::class, 'show'])->name('servers.show')->where('server', '[a-z0-9][a-z0-9-]*');
Route::delete('/servers/{server}', [ServerController::class, 'destroy'])->name('servers.destroy')->where('server', '[a-z0-9][a-z0-9-]*');

Route::get('/runs', [RunController::class, 'index'])->name('runs.index');
Route::get('/runs/{run}', [RunController::class, 'show'])->name('runs.show');
Route::post('/runs/{run}/cancel', [RunController::class, 'cancel'])->name('runs.cancel');
