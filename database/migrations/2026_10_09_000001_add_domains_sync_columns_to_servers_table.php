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
            // Separate from the server's own sync_status/last_synced_at: those
            // track cloud:stacks identity (name, ip, status, …), a different
            // CLI round-trip than ExternalDNS/TLS/Ingress discovery, so one
            // failing must never be mistaken for the other.
            $table->string('domains_sync_status')->default('stale')->after('last_sync_error');
            $table->timestamp('domains_last_synced_at')->nullable()->after('domains_sync_status');
            $table->text('domains_last_sync_error')->nullable()->after('domains_last_synced_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropColumn(['domains_sync_status', 'domains_last_synced_at', 'domains_last_sync_error']);
        });
    }
};
