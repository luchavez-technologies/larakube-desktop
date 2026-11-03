<?php

namespace Database\Factories;

use App\Models\Server;
use App\Models\SsoGrant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SsoGrant>
 */
class SsoGrantFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var class-string<SsoGrant>
     */
    protected $model = SsoGrant::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        /** @var array<string, string> $tools */
        $tools = [
            'forgejo' => 'Forgejo (Git Forge & CI/CD)',
            'grafana' => 'Grafana (Metrics & Dashboards)',
            'outline' => 'Outline (Team Knowledge Base)',
        ];

        $slug = fake()->randomElement(array_keys($tools));

        return [
            'server_id' => fn (): int => Server::firstOrCreate(
                ['name' => 'default-server'],
                [
                    'provider' => 'gcp',
                    'kind' => 'vps',
                    'context' => 'default-context',
                    'status' => 'ready',
                ],
            )->id,
            'cluster_tool_id' => null,
            'email' => fake()->safeEmail(),
            'tool' => $tools[$slug],
            'slug' => $slug,
            'role' => fake()->randomElement(['admin', 'editor', 'viewer', 'member']),
            'project' => fake()->randomElement(['default', 'internal', 'engineering']),
        ];
    }
}
