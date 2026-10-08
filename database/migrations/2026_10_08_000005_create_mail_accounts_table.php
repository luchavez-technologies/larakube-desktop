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
        Schema::create('mail_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('server_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cluster_tool_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('mail_domain_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email');
            $table->string('name')->nullable();
            $table->string('role')->nullable();
            $table->unsignedBigInteger('quota_bytes')->nullable();
            $table->unsignedBigInteger('used_bytes')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->unique(['server_id', 'email']);
            $table->index('mail_domain_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mail_accounts');
    }
};
