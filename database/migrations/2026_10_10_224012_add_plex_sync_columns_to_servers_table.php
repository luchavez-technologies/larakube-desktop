<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            // Separate from the server's own sync_status/last_synced_at
            // (cloud:stacks identity) and domains_* (its own CLI round-trip)
            // — `plex:show --json` is its own slow call on a tool-dense
            // cluster, so one failing must never be mistaken for another.
            $table->string('plex_sync_status')->default('stale')->after('domains_last_sync_error');
            $table->timestamp('plex_last_synced_at')->nullable()->after('plex_sync_status');
            $table->text('plex_last_sync_error')->nullable()->after('plex_last_synced_at');
            $table->json('plex_data')->nullable()->after('plex_last_sync_error');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropColumn(['plex_sync_status', 'plex_last_synced_at', 'plex_last_sync_error', 'plex_data']);
        });
    }
};
