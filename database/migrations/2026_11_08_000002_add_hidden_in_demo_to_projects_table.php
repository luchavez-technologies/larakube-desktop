<?php

use App\Services\LaraKube\GlobalSettings;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            $table->boolean('hidden_in_demo')->default(false)->after('last_inspected_at');
        });

        try {
            $hiddenPaths = app(GlobalSettings::class)->demoHiddenProjects();
            if ($hiddenPaths !== []) {
                DB::table('projects')
                    ->whereIn('path', $hiddenPaths)
                    ->update(['hidden_in_demo' => true]);
            }
        } catch (Throwable) {
            // Safe fallback if GlobalSettings cannot be resolved during isolated test setup.
        }
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            $table->dropColumn('hidden_in_demo');
        });
    }
};
