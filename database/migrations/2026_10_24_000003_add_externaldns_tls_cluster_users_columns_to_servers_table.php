<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->json('externaldns_data')->nullable();
            $table->string('externaldns_sync_status')->default('stale');
            $table->timestamp('externaldns_last_synced_at')->nullable();
            $table->text('externaldns_last_sync_error')->nullable();

            $table->json('tls_data')->nullable();
            $table->string('tls_sync_status')->default('stale');
            $table->timestamp('tls_last_synced_at')->nullable();
            $table->text('tls_last_sync_error')->nullable();

            $table->json('cluster_users_data')->nullable();
            $table->string('cluster_users_sync_status')->default('stale');
            $table->timestamp('cluster_users_last_synced_at')->nullable();
            $table->text('cluster_users_last_sync_error')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropColumn([
                'externaldns_data',
                'externaldns_sync_status',
                'externaldns_last_synced_at',
                'externaldns_last_sync_error',
                'tls_data',
                'tls_sync_status',
                'tls_last_synced_at',
                'tls_last_sync_error',
                'cluster_users_data',
                'cluster_users_sync_status',
                'cluster_users_last_synced_at',
                'cluster_users_last_sync_error',
            ]);
        });
    }
};
