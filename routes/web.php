<?php

use App\Http\Controllers\ReadinessController;
use App\Http\Controllers\RunController;
use App\Http\Controllers\ServerController;
use App\Http\Controllers\ToolInstallController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/readiness')->name('home');

Route::get('/readiness', [ReadinessController::class, 'show'])->name('readiness');
Route::post('/tools/{tool}/install', [ToolInstallController::class, 'store'])->name('tools.install');

Route::get('/servers/create', [ServerController::class, 'create'])->name('servers.create');
Route::post('/servers', [ServerController::class, 'store'])->name('servers.store');

Route::get('/runs/{run}', [RunController::class, 'show'])->name('runs.show');
Route::post('/runs/{run}/cancel', [RunController::class, 'cancel'])->name('runs.cancel');
