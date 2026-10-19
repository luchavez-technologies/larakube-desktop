<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('cloud_providers', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique(); // 'do', 'hetzner', 'gcp', 'aws'
            $table->string('label');
            $table->string('default_region');
            $table->string('default_vps_size');
            $table->string('default_managed_size')->nullable();
            $table->string('managed_provider')->nullable(); // 'doks', 'eks', 'gke', 'custom'
            $table->string('ha_option')->nullable();
            $table->string('ha_cost')->nullable();
            $table->string('pricing_url')->nullable();
            $table->boolean('credentials_ready')->default(false);
            $table->string('credentials_hint')->nullable();
            $table->string('active_account')->nullable();
            $table->json('accounts')->nullable();
            $table->string('source')->default('builtin'); // 'builtin', 'live', 'cached'
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();
        });

        Schema::create('cloud_regions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cloud_provider_id')->constrained('cloud_providers')->cascadeOnDelete();
            $table->string('slug'); // 'nyc1', 'us-east-1'
            $table->string('label');
            $table->boolean('is_recommended')->default(false);
            $table->timestamps();

            $table->unique(['cloud_provider_id', 'slug']);
        });

        Schema::create('cloud_sizes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cloud_provider_id')->constrained('cloud_providers')->cascadeOnDelete();
            $table->string('slug'); // 's-1vcpu-1gb', 't3.micro'
            $table->string('label');
            $table->string('target_kind')->default('vps'); // 'vps', 'managed'
            $table->integer('vcpu')->default(1);
            $table->integer('memory_mb')->default(1024);
            $table->decimal('monthly_price', 10, 2)->nullable();
            $table->string('currency', 3)->default('USD');
            $table->boolean('is_recommended')->default(false);
            $table->timestamps();

            $table->unique(['cloud_provider_id', 'slug', 'target_kind']);
            $table->index(['cloud_provider_id', 'target_kind']);
        });

        Schema::table('servers', function (Blueprint $table): void {
            $table->string('size')->nullable()->after('region');
            $table->foreignId('cloud_provider_id')->nullable()->after('provider')->constrained('cloud_providers')->nullOnDelete();
            $table->foreignId('cloud_region_id')->nullable()->after('cloud_provider_id')->constrained('cloud_regions')->nullOnDelete();
            $table->foreignId('cloud_size_id')->nullable()->after('cloud_region_id')->constrained('cloud_sizes')->nullOnDelete();

            $table->index(['cloud_provider_id', 'cloud_region_id']);
        });

        $this->seedInitialCatalogs();
        $this->backfillExistingServers();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table): void {
            $table->dropForeign(['cloud_provider_id']);
            $table->dropForeign(['cloud_region_id']);
            $table->dropForeign(['cloud_size_id']);
            $table->dropColumn(['size', 'cloud_provider_id', 'cloud_region_id', 'cloud_size_id']);
        });

        Schema::dropIfExists('cloud_sizes');
        Schema::dropIfExists('cloud_regions');
        Schema::dropIfExists('cloud_providers');
    }

    private function seedInitialCatalogs(): void
    {
        $catalogs = [
            'do' => [
                'label' => 'DigitalOcean',
                'default_region' => 'nyc1',
                'default_vps_size' => 's-1vcpu-1gb',
                'default_managed_size' => 's-1vcpu-2gb',
                'managed_provider' => 'doks',
                'ha_option' => 'boolean',
                'ha_cost' => '+$40/mo for High Availability control plane',
                'pricing_url' => null,
                'regions' => [
                    ['slug' => 'nyc1', 'label' => 'nyc1  —  New York 1', 'is_recommended' => true],
                    ['slug' => 'nyc2', 'label' => 'nyc2  —  New York 2', 'is_recommended' => false],
                    ['slug' => 'nyc3', 'label' => 'nyc3  —  New York 3', 'is_recommended' => false],
                    ['slug' => 'sfo2', 'label' => 'sfo2  —  San Francisco 2', 'is_recommended' => false],
                    ['slug' => 'sfo3', 'label' => 'sfo3  —  San Francisco 3', 'is_recommended' => false],
                    ['slug' => 'atl1', 'label' => 'atl1  —  Atlanta 1', 'is_recommended' => false],
                    ['slug' => 'ric1', 'label' => 'ric1  —  Richmond 1', 'is_recommended' => false],
                    ['slug' => 'tor1', 'label' => 'tor1  —  Toronto 1', 'is_recommended' => false],
                    ['slug' => 'ams3', 'label' => 'ams3  —  Amsterdam 3', 'is_recommended' => false],
                    ['slug' => 'lon1', 'label' => 'lon1  —  London 1', 'is_recommended' => false],
                    ['slug' => 'fra1', 'label' => 'fra1  —  Frankfurt 1', 'is_recommended' => false],
                    ['slug' => 'sgp1', 'label' => 'sgp1  —  Singapore 1', 'is_recommended' => false],
                    ['slug' => 'blr1', 'label' => 'blr1  —  Bangalore 1', 'is_recommended' => false],
                    ['slug' => 'syd1', 'label' => 'syd1  —  Sydney 1', 'is_recommended' => false],
                ],
                'vps_sizes' => [
                    ['slug' => 's-1vcpu-1gb', 'label' => 's-1vcpu-1gb   —  1 vCPU,  1 GB RAM  (~$6/mo)', 'vcpu' => 1, 'memory_mb' => 1024, 'monthly_price' => 6.00, 'currency' => 'USD', 'is_recommended' => true],
                    ['slug' => 's-1vcpu-2gb', 'label' => 's-1vcpu-2gb   —  1 vCPU,  2 GB RAM  (~$12/mo)', 'vcpu' => 1, 'memory_mb' => 2048, 'monthly_price' => 12.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 's-2vcpu-2gb', 'label' => 's-2vcpu-2gb   —  2 vCPU,  2 GB RAM  (~$18/mo)', 'vcpu' => 2, 'memory_mb' => 2048, 'monthly_price' => 18.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 's-2vcpu-4gb', 'label' => 's-2vcpu-4gb   —  2 vCPU,  4 GB RAM  (~$24/mo)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 24.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 's-4vcpu-8gb', 'label' => 's-4vcpu-8gb   —  4 vCPU,  8 GB RAM  (~$48/mo)', 'vcpu' => 4, 'memory_mb' => 8192, 'monthly_price' => 48.00, 'currency' => 'USD', 'is_recommended' => false],
                ],
                'managed_sizes' => [
                    ['slug' => 's-1vcpu-2gb', 'label' => 's-1vcpu-2gb   —  1 vCPU,  2 GB RAM  (~$12/mo per node)', 'vcpu' => 1, 'memory_mb' => 2048, 'monthly_price' => 12.00, 'currency' => 'USD', 'is_recommended' => true],
                    ['slug' => 's-2vcpu-2gb', 'label' => 's-2vcpu-2gb   —  2 vCPU,  2 GB RAM  (~$18/mo per node)', 'vcpu' => 2, 'memory_mb' => 2048, 'monthly_price' => 18.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 's-2vcpu-4gb', 'label' => 's-2vcpu-4gb   —  2 vCPU,  4 GB RAM  (~$24/mo per node)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 24.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 's-4vcpu-8gb', 'label' => 's-4vcpu-8gb   —  4 vCPU,  8 GB RAM  (~$48/mo per node)', 'vcpu' => 4, 'memory_mb' => 8192, 'monthly_price' => 48.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 's-8vcpu-16gb', 'label' => 's-8vcpu-16gb  —  8 vCPU, 16 GB RAM  (~$96/mo per node)', 'vcpu' => 8, 'memory_mb' => 16384, 'monthly_price' => 96.00, 'currency' => 'USD', 'is_recommended' => false],
                ],
            ],
            'hetzner' => [
                'label' => 'Hetzner Cloud',
                'default_region' => 'fsn1',
                'default_vps_size' => 'cx22',
                'default_managed_size' => null,
                'managed_provider' => null,
                'ha_option' => null,
                'ha_cost' => null,
                'pricing_url' => null,
                'regions' => [
                    ['slug' => 'fsn1', 'label' => 'fsn1  —  Falkenstein, Germany (Recommended)', 'is_recommended' => true],
                    ['slug' => 'nbg1', 'label' => 'nbg1  —  Nuremberg, Germany', 'is_recommended' => false],
                    ['slug' => 'hel1', 'label' => 'hel1  —  Helsinki, Finland', 'is_recommended' => false],
                    ['slug' => 'ash', 'label' => 'ash   —  Ashburn, Virginia, USA', 'is_recommended' => false],
                    ['slug' => 'hil', 'label' => 'hil   —  Hillsboro, Oregon, USA', 'is_recommended' => false],
                ],
                'vps_sizes' => [
                    ['slug' => 'cx22', 'label' => 'cx22   —  2 vCPU,  4 GB RAM  (~€3.80/mo, Recommended)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 3.80, 'currency' => 'EUR', 'is_recommended' => true],
                    ['slug' => 'cax11', 'label' => 'cax11  —  2 vCPU (ARM), 4 GB RAM  (~€3.30/mo)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 3.30, 'currency' => 'EUR', 'is_recommended' => false],
                    ['slug' => 'cx32', 'label' => 'cx32   —  4 vCPU,  8 GB RAM  (~€7.50/mo)', 'vcpu' => 4, 'memory_mb' => 8192, 'monthly_price' => 7.50, 'currency' => 'EUR', 'is_recommended' => false],
                    ['slug' => 'cax21', 'label' => 'cax21  —  4 vCPU (ARM), 8 GB RAM  (~€6.50/mo)', 'vcpu' => 4, 'memory_mb' => 8192, 'monthly_price' => 6.50, 'currency' => 'EUR', 'is_recommended' => false],
                    ['slug' => 'cpx31', 'label' => 'cpx31  —  4 vCPU (Dedicated AMD), 8 GB RAM  (~€13.40/mo)', 'vcpu' => 4, 'memory_mb' => 8192, 'monthly_price' => 13.40, 'currency' => 'EUR', 'is_recommended' => false],
                    ['slug' => 'cx42', 'label' => 'cx42   —  8 vCPU, 16 GB RAM  (~€16.00/mo)', 'vcpu' => 8, 'memory_mb' => 16384, 'monthly_price' => 16.00, 'currency' => 'EUR', 'is_recommended' => false],
                ],
                'managed_sizes' => [],
            ],
            'gcp' => [
                'label' => 'Google Cloud Platform',
                'default_region' => 'us-central1',
                'default_vps_size' => 'e2-medium',
                'default_managed_size' => 'e2-medium',
                'managed_provider' => 'gke',
                'ha_option' => 'tier',
                'ha_cost' => 'Standard tier includes multi-zone SLA ($74/mo); Autopilot manages masters free',
                'pricing_url' => 'https://cloud.google.com/compute/vm-instance-pricing',
                'regions' => [
                    ['slug' => 'us-central1', 'label' => 'us-central1  —  Iowa (Recommended)', 'is_recommended' => true],
                    ['slug' => 'us-east1', 'label' => 'us-east1  —  South Carolina', 'is_recommended' => false],
                    ['slug' => 'us-west1', 'label' => 'us-west1  —  Oregon', 'is_recommended' => false],
                    ['slug' => 'europe-west1', 'label' => 'europe-west1  —  Belgium', 'is_recommended' => false],
                    ['slug' => 'europe-west3', 'label' => 'europe-west3  —  Frankfurt', 'is_recommended' => false],
                    ['slug' => 'europe-west4', 'label' => 'europe-west4  —  Netherlands', 'is_recommended' => false],
                    ['slug' => 'asia-southeast1', 'label' => 'asia-southeast1  —  Singapore', 'is_recommended' => false],
                    ['slug' => 'asia-east1', 'label' => 'asia-east1  —  Taiwan', 'is_recommended' => false],
                    ['slug' => 'asia-northeast1', 'label' => 'asia-northeast1  —  Tokyo', 'is_recommended' => false],
                    ['slug' => 'australia-southeast1', 'label' => 'australia-southeast1  —  Sydney', 'is_recommended' => false],
                ],
                'vps_sizes' => [
                    ['slug' => 'e2-micro', 'label' => 'e2-micro   —  2 vCPU,  1 GB RAM  (Free Tier eligible)', 'vcpu' => 2, 'memory_mb' => 1024, 'monthly_price' => null, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 'e2-small', 'label' => 'e2-small   —  2 vCPU,  2 GB RAM  (~$14/mo)', 'vcpu' => 2, 'memory_mb' => 2048, 'monthly_price' => 14.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 'e2-medium', 'label' => 'e2-medium  —  2 vCPU,  4 GB RAM  (~$25/mo, Recommended)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 25.00, 'currency' => 'USD', 'is_recommended' => true],
                    ['slug' => 'e2-standard-2', 'label' => 'e2-standard-2 — 2 vCPU,  8 GB RAM  (~$49/mo)', 'vcpu' => 2, 'memory_mb' => 8192, 'monthly_price' => 49.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 'e2-standard-4', 'label' => 'e2-standard-4 — 4 vCPU, 16 GB RAM  (~$97/mo)', 'vcpu' => 4, 'memory_mb' => 16384, 'monthly_price' => 97.00, 'currency' => 'USD', 'is_recommended' => false],
                ],
                'managed_sizes' => [
                    ['slug' => 'e2-medium', 'label' => 'e2-medium   —  2 vCPU,  4 GB RAM  (~$25/mo per node)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 25.00, 'currency' => 'USD', 'is_recommended' => true],
                    ['slug' => 'e2-standard-2', 'label' => 'e2-standard-2 — 2 vCPU,  8 GB RAM  (~$49/mo per node)', 'vcpu' => 2, 'memory_mb' => 8192, 'monthly_price' => 49.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 'e2-standard-4', 'label' => 'e2-standard-4 — 4 vCPU, 16 GB RAM  (~$97/mo per node)', 'vcpu' => 4, 'memory_mb' => 16384, 'monthly_price' => 97.00, 'currency' => 'USD', 'is_recommended' => false],
                ],
            ],
            'aws' => [
                'label' => 'Amazon Web Services',
                'default_region' => 'us-east-1',
                'default_vps_size' => 't3.medium',
                'default_managed_size' => 't3.medium',
                'managed_provider' => 'eks',
                'ha_option' => 'always',
                'ha_cost' => 'AWS charges a flat ~$73/mo for the EKS control plane',
                'pricing_url' => 'https://aws.amazon.com/ec2/pricing/on-demand/',
                'regions' => [
                    ['slug' => 'us-east-1', 'label' => 'us-east-1  —  N. Virginia (Recommended)', 'is_recommended' => true],
                    ['slug' => 'us-east-2', 'label' => 'us-east-2  —  Ohio', 'is_recommended' => false],
                    ['slug' => 'us-west-1', 'label' => 'us-west-1  —  N. California', 'is_recommended' => false],
                    ['slug' => 'us-west-2', 'label' => 'us-west-2  —  Oregon', 'is_recommended' => false],
                    ['slug' => 'eu-west-1', 'label' => 'eu-west-1  —  Ireland', 'is_recommended' => false],
                    ['slug' => 'eu-central-1', 'label' => 'eu-central-1  —  Frankfurt', 'is_recommended' => false],
                    ['slug' => 'ap-southeast-1', 'label' => 'ap-southeast-1  —  Singapore', 'is_recommended' => false],
                    ['slug' => 'ap-southeast-2', 'label' => 'ap-southeast-2  —  Sydney', 'is_recommended' => false],
                    ['slug' => 'ap-northeast-1', 'label' => 'ap-northeast-1  —  Tokyo', 'is_recommended' => false],
                ],
                'vps_sizes' => [
                    ['slug' => 't3.micro', 'label' => 't3.micro    —  2 vCPU,  1 GB RAM  (Free Tier eligible)', 'vcpu' => 2, 'memory_mb' => 1024, 'monthly_price' => null, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 't3.small', 'label' => 't3.small    —  2 vCPU,  2 GB RAM  (~$15/mo)', 'vcpu' => 2, 'memory_mb' => 2048, 'monthly_price' => 15.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 't3.medium', 'label' => 't3.medium   —  2 vCPU,  4 GB RAM  (~$30/mo, Recommended)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 30.00, 'currency' => 'USD', 'is_recommended' => true],
                    ['slug' => 't3.large', 'label' => 't3.large    —  2 vCPU,  8 GB RAM  (~$60/mo)', 'vcpu' => 2, 'memory_mb' => 8192, 'monthly_price' => 60.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 't3.xlarge', 'label' => 't3.xlarge   —  4 vCPU, 16 GB RAM  (~$120/mo)', 'vcpu' => 4, 'memory_mb' => 16384, 'monthly_price' => 120.00, 'currency' => 'USD', 'is_recommended' => false],
                ],
                'managed_sizes' => [
                    ['slug' => 't3.medium', 'label' => 't3.medium   —  2 vCPU,  4 GB RAM  (~$30/mo per node)', 'vcpu' => 2, 'memory_mb' => 4096, 'monthly_price' => 30.00, 'currency' => 'USD', 'is_recommended' => true],
                    ['slug' => 't3.large', 'label' => 't3.large    —  2 vCPU,  8 GB RAM  (~$60/mo per node)', 'vcpu' => 2, 'memory_mb' => 8192, 'monthly_price' => 60.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 'm5.large', 'label' => 'm5.large    —  2 vCPU,  8 GB RAM  (~$70/mo per node)', 'vcpu' => 2, 'memory_mb' => 8192, 'monthly_price' => 70.00, 'currency' => 'USD', 'is_recommended' => false],
                    ['slug' => 'm5.xlarge', 'label' => 'm5.xlarge   —  4 vCPU, 16 GB RAM  (~$140/mo per node)', 'vcpu' => 4, 'memory_mb' => 16384, 'monthly_price' => 140.00, 'currency' => 'USD', 'is_recommended' => false],
                ],
            ],
        ];

        foreach ($catalogs as $slug => $data) {
            $providerId = DB::table('cloud_providers')->insertGetId([
                'slug' => $slug,
                'label' => $data['label'],
                'default_region' => $data['default_region'],
                'default_vps_size' => $data['default_vps_size'],
                'default_managed_size' => $data['default_managed_size'],
                'managed_provider' => $data['managed_provider'],
                'ha_option' => $data['ha_option'],
                'ha_cost' => $data['ha_cost'],
                'pricing_url' => $data['pricing_url'],
                'source' => 'builtin',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($data['regions'] as $reg) {
                DB::table('cloud_regions')->insert([
                    'cloud_provider_id' => $providerId,
                    'slug' => $reg['slug'],
                    'label' => $reg['label'],
                    'is_recommended' => $reg['is_recommended'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            foreach ($data['vps_sizes'] as $size) {
                DB::table('cloud_sizes')->insert([
                    'cloud_provider_id' => $providerId,
                    'slug' => $size['slug'],
                    'label' => $size['label'],
                    'target_kind' => 'vps',
                    'vcpu' => $size['vcpu'] ?? 2,
                    'memory_mb' => $size['memory_mb'] ?? 2048,
                    'monthly_price' => $size['monthly_price'] ?? null,
                    'currency' => $size['currency'] ?? 'USD',
                    'is_recommended' => $size['is_recommended'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            foreach ($data['managed_sizes'] as $size) {
                DB::table('cloud_sizes')->insert([
                    'cloud_provider_id' => $providerId,
                    'slug' => $size['slug'],
                    'label' => $size['label'],
                    'target_kind' => 'managed',
                    'vcpu' => $size['vcpu'] ?? 2,
                    'memory_mb' => $size['memory_mb'] ?? 2048,
                    'monthly_price' => $size['monthly_price'] ?? null,
                    'currency' => $size['currency'] ?? 'USD',
                    'is_recommended' => $size['is_recommended'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    private function backfillExistingServers(): void
    {
        $providers = DB::table('cloud_providers')->pluck('id', 'slug')->all();

        foreach ($providers as $slug => $providerId) {
            DB::table('servers')
                ->where('provider', $slug)
                ->update(['cloud_provider_id' => $providerId]);

            $regions = DB::table('cloud_regions')
                ->where('cloud_provider_id', $providerId)
                ->pluck('id', 'slug')
                ->all();

            foreach ($regions as $regionSlug => $regionId) {
                DB::table('servers')
                    ->where('cloud_provider_id', $providerId)
                    ->where('region', $regionSlug)
                    ->update(['cloud_region_id' => $regionId]);
            }
        }
    }
};
