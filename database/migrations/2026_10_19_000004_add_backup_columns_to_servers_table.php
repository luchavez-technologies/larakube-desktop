<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->string('backup_sync_status')->default('stale')->after('plex_data');
            $table->boolean('backup_configured')->nullable()->after('backup_sync_status');
            $table->timestamp('backup_last_synced_at')->nullable()->after('backup_configured');
            $table->text('backup_last_sync_error')->nullable()->after('backup_last_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropColumn([
                'backup_sync_status',
                'backup_configured',
                'backup_last_synced_at',
                'backup_last_sync_error',
            ]);
        });
    }
};
