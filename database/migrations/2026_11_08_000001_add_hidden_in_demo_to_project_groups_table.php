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
        Schema::table('project_groups', function (Blueprint $table): void {
            $table->boolean('hidden_in_demo')->default(false)->after('color');
        });

        try {
            $hiddenNames = app(GlobalSettings::class)->demoHiddenProjectGroups();
            if ($hiddenNames !== []) {
                DB::table('project_groups')
                    ->whereIn('name', $hiddenNames)
                    ->update(['hidden_in_demo' => true]);
            }
        } catch (Throwable) {
            // Safe fallback if GlobalSettings cannot be resolved during isolated test setup.
        }
    }

    public function down(): void
    {
        Schema::table('project_groups', function (Blueprint $table): void {
            $table->dropColumn('hidden_in_demo');
        });
    }
};
