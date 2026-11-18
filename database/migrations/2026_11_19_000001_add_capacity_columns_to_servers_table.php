<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table): void {
            $table->string('capacity_sync_status')->default('idle')->after('cluster_users_last_sync_error');
            $table->json('capacity_data')->nullable()->after('capacity_sync_status');
            $table->timestamp('capacity_last_synced_at')->nullable()->after('capacity_data');
            $table->text('capacity_last_sync_error')->nullable()->after('capacity_last_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table): void {
            $table->dropColumn([
                'capacity_sync_status',
                'capacity_data',
                'capacity_last_synced_at',
                'capacity_last_sync_error',
            ]);
        });
    }
};
