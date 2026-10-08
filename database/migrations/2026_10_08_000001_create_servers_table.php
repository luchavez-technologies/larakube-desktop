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
        Schema::create('servers', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('role')->default('deploy');
            $table->string('provider');
            $table->string('kind');
            $table->string('region')->nullable();
            $table->string('ip')->nullable();
            $table->string('context')->nullable();
            $table->string('ssh_key')->nullable();
            $table->json('bindings')->nullable();
            $table->string('account')->nullable();
            $table->string('cloud_project_id')->nullable();
            $table->string('status');
            $table->string('sync_status')->default('stale');
            $table->timestamp('last_synced_at')->nullable();
            $table->text('last_sync_error')->nullable();
            $table->timestamps();

            $table->index('context');
            $table->index('role');
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('servers');
    }
};
