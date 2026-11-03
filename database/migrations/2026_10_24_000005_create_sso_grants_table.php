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
        Schema::create('sso_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('server_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cluster_tool_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email');
            $table->string('tool');    // display label, e.g. "Forgejo (Git Forge & CI/CD)"
            $table->string('slug');    // ClusterTool enum value, e.g. "forgejo"
            $table->string('role');    // Zitadel role key
            $table->string('project'); // Zitadel project name
            $table->timestamps();

            $table->unique(['server_id', 'email', 'slug', 'role', 'project'], 'sso_grants_unique');
            $table->index(['server_id', 'email']);
            $table->index(['server_id', 'slug']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sso_grants');
    }
};
