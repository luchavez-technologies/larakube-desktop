<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('runs', function (Blueprint $table) {
            $table->foreignId('server_id')->nullable()->after('project_name')->constrained('servers')->nullOnDelete();
            $table->index('server_id');
        });

        $servers = DB::table('servers')->get(['id', 'name', 'context']);

        foreach ($servers as $server) {
            DB::table('runs')
                ->whereNull('server_id')
                ->where(function ($q) use ($server) {
                    $q->where('server_name', $server->name);
                    if ($server->context) {
                        $q->orWhere('context', $server->context);
                    }
                })
                ->update(['server_id' => $server->id]);
        }
    }

    public function down(): void
    {
        Schema::table('runs', function (Blueprint $table) {
            $table->dropIndex(['server_id']);
            $table->dropForeign(['server_id']);
            $table->dropColumn('server_id');
        });
    }
};
