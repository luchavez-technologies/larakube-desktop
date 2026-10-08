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
        Schema::create('cluster_tools', function (Blueprint $table) {
            $table->id();
            $table->foreignId('server_id')->constrained()->cascadeOnDelete();
            $table->string('tool');
            $table->string('host')->nullable();
            $table->string('instance')->nullable();
            $table->boolean('installed')->default(false);
            $table->boolean('multi_instance')->default(true);
            $table->unsignedInteger('position')->default(0);
            $table->json('data');
            $table->string('sync_status')->default('stale');
            $table->timestamp('last_synced_at')->nullable();
            $table->text('last_sync_error')->nullable();
            $table->timestamps();

            $table->unique(['server_id', 'tool', 'host']);
            $table->index(['server_id', 'installed']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cluster_tools');
    }
};
