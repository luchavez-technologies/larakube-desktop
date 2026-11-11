<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_tools', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->string('brand');
            $table->string('tagline')->default('');
            $table->string('icon')->nullable();
            $table->string('logo')->nullable();
            $table->string('source')->default('official')->index();
            $table->boolean('paid')->default(false);
            $table->unsignedInteger('upvotes_count')->default(0);
            $table->json('stack')->nullable();
            $table->json('categories')->nullable();
            $table->json('commons_capabilities')->nullable();
            $table->json('init_fields')->nullable();
            $table->boolean('supports_no_plex')->default(false)->index();
            $table->boolean('multi_instance')->default(true);
            $table->boolean('requires_admin_email')->default(false);
            $table->unsignedInteger('position')->default(0);
            $table->timestamp('remote_updated_at')->nullable()->index();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_tools');
    }
};
