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
        Schema::table('runs', function (Blueprint $table) {
            $table->string('target_type')->nullable()->after('kind');
            $table->string('target_name')->nullable()->after('target_type');
            $table->foreignId('project_id')->nullable()->after('subject')->constrained('projects')->nullOnDelete();
            $table->string('project_name')->nullable()->after('project_id');
            $table->string('environment')->nullable()->after('project_name');
            $table->string('server_name')->nullable()->after('environment');
            $table->string('context')->nullable()->after('server_name');
            $table->string('tool')->nullable()->after('context');

            $table->index(['project_id', 'environment']);
            $table->index(['server_name']);
            $table->index(['context']);
            $table->index(['tool']);
            $table->index(['target_type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('runs', function (Blueprint $table) {
            $table->dropIndex(['project_id', 'environment']);
            $table->dropIndex(['server_name']);
            $table->dropIndex(['context']);
            $table->dropIndex(['tool']);
            $table->dropIndex(['target_type']);
            $table->dropForeign(['project_id']);
            $table->dropColumn([
                'target_type',
                'target_name',
                'project_id',
                'project_name',
                'environment',
                'server_name',
                'context',
                'tool',
            ]);
        });
    }
};
