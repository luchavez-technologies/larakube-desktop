<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->string('name')->nullable()->after('path');
            $table->string('framework')->nullable()->after('name');
            $table->foreignId('server_id')->nullable()->after('framework')->constrained('servers')->nullOnDelete();
            $table->string('environment')->default('production')->after('server_id');
            $table->string('web_host')->nullable()->after('environment');
            $table->json('blueprint_cache')->nullable()->after('web_host');
            $table->timestamp('last_inspected_at')->nullable()->after('blueprint_cache');

            $table->index('server_id');
            $table->index('name');
        });

        $projects = DB::table('projects')->get();
        $servers = DB::table('servers')->get(['id', 'context', 'ip']);
        $byContext = $servers->whereNotNull('context')->keyBy('context');
        $byIp = $servers->whereNotNull('ip')->keyBy('ip');

        foreach ($projects as $project) {
            $path = $project->path;
            $name = basename($path);
            $framework = null;
            $webHost = null;
            $serverId = null;
            $blueprint = null;

            if (is_dir($path)) {
                $blueprintFile = "{$path}/.larakube.json";
                if (file_exists($blueprintFile)) {
                    $decoded = json_decode((string) file_get_contents($blueprintFile), true);
                    if (is_array($decoded)) {
                        $blueprint = $decoded;
                        $name = is_string($decoded['name'] ?? null) ? $decoded['name'] : $name;
                        $framework = is_string($decoded['framework'] ?? null) ? $decoded['framework'] : 'laravel';
                        $webHost = is_string($decoded['environments']['production']['hosts']['web'] ?? null)
                            ? $decoded['environments']['production']['hosts']['web']
                            : null;
                    }
                }

                $localFile = "{$path}/.larakube.local.json";
                if (file_exists($localFile)) {
                    $decodedLocal = json_decode((string) file_get_contents($localFile), true);
                    if (is_array($decodedLocal)) {
                        $cloud = is_array($decodedLocal['environments']['production']['cloud'] ?? null)
                            ? $decodedLocal['environments']['production']['cloud']
                            : null;
                        $context = is_string($cloud['context'] ?? null) ? $cloud['context'] : null;
                        $ip = is_string($cloud['ip'] ?? null) ? $cloud['ip'] : null;

                        if ($context && isset($byContext[$context])) {
                            $serverId = $byContext[$context]->id;
                        } elseif ($ip && isset($byIp[$ip])) {
                            $serverId = $byIp[$ip]->id;
                        }
                    }
                }
            }

            DB::table('projects')->where('id', $project->id)->update([
                'name' => $name,
                'framework' => $framework,
                'server_id' => $serverId,
                'web_host' => $webHost,
                'blueprint_cache' => $blueprint ? json_encode($blueprint) : null,
                'last_inspected_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['server_id']);
            $table->dropIndex(['name']);
            $table->dropForeign(['server_id']);
            $table->dropColumn([
                'name',
                'framework',
                'server_id',
                'environment',
                'web_host',
                'blueprint_cache',
                'last_inspected_at',
            ]);
        });
    }
};
