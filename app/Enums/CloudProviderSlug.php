<?php

namespace App\Enums;

enum CloudProviderSlug: string
{
    case GCP = 'gcp';
    case AWS = 'aws';
    case DO = 'do';
    case HETZNER = 'hetzner';
    case CUSTOM = 'custom';

    public function label(): string
    {
        return match ($this) {
            self::GCP => 'Google Cloud',
            self::AWS => 'Amazon Web Services',
            self::DO => 'DigitalOcean',
            self::HETZNER => 'Hetzner Cloud',
            self::CUSTOM => 'Custom / Existing Server',
        };
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $case): string => $case->value, self::cases());
    }

    /**
     * Managed cloud providers selectable in Settings & Onboarding.
     *
     * @return array<string, string>
     */
    public static function configuredOptions(): array
    {
        $options = [];
        foreach ([self::GCP, self::AWS, self::DO, self::HETZNER] as $provider) {
            $options[$provider->value] = $provider->label();
        }

        return $options;
    }
}
