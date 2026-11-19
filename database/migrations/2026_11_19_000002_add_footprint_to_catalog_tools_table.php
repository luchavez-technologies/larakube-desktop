<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('catalog_tools', function (Blueprint $table): void {
            $table->json('footprint')->nullable()->after('requires_admin_email');
        });
    }

    public function down(): void
    {
        Schema::table('catalog_tools', function (Blueprint $table): void {
            $table->dropColumn('footprint');
        });
    }
};
