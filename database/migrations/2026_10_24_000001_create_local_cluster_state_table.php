<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('local_cluster_state', function (Blueprint $table) {
            $table->id();
            $table->string('engine')->nullable();
            $table->string('context')->nullable();
            $table->string('status')->nullable();
            $table->string('tone')->nullable();
            $table->string('sync_status')->default('stale');
            $table->timestamp('last_synced_at')->nullable();
            $table->text('last_sync_error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('local_cluster_state');
    }
};
