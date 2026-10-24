<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('local_cluster_state', function (Blueprint $table) {
            $table->json('workloads_data')->nullable();
            $table->string('workloads_sync_status')->default('stale');
            $table->timestamp('workloads_last_synced_at')->nullable();
            $table->text('workloads_last_sync_error')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('local_cluster_state', function (Blueprint $table) {
            $table->dropColumn(['workloads_data', 'workloads_sync_status', 'workloads_last_synced_at', 'workloads_last_sync_error']);
        });
    }
};
