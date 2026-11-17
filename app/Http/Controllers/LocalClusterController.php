<?php

namespace App\Http\Controllers;

use App\Jobs\Sync\SyncLocalClusterJob;
use App\Jobs\Sync\SyncLocalWorkloadsJob;
use App\Models\LocalClusterState;
use App\Services\LaraKube\LocalCluster;
use App\Services\Wsl;
use Illuminate\Http\RedirectResponse;

class LocalClusterController extends Controller
{
    /**
     * Wakes LaraKube Linux (Windows only) and keeps it awake while Desktop is
     * open. The card reads "starting" until k3s answers; the sync jobs pick
     * that up on their own.
     */
    public function wake(Wsl $wsl, LocalCluster $localCluster): RedirectResponse
    {
        if (! $wsl->keepAwake()) {
            return back()->withErrors(['wake' => 'LaraKube Linux could not be woken. Check that it is installed on the Setup page.']);
        }

        $localCluster->forget();
        LocalClusterState::current()->update([
            'status' => LocalCluster::STARTING_STATUS,
            'tone' => 'warn',
        ]);
        SyncLocalClusterJob::dispatch();
        SyncLocalWorkloadsJob::dispatch();

        return back()->with('success', 'Waking LaraKube Linux. Local projects are back once k3s has started.');
    }
}
