<?php

namespace App\Enums;

enum DnsProvider: string
{
    case CLOUDFLARE = 'cloudflare';
    case ROUTE53 = 'route53';
    case GOOGLE = 'google';
    case NONE = 'none';

    public function label(): string
    {
        return match ($this) {
            self::CLOUDFLARE => 'Cloudflare',
            self::ROUTE53 => 'AWS Route 53',
            self::GOOGLE => 'Google Cloud DNS',
            self::NONE => 'None (Manual DNS)',
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
     * Providers supported by ExternalDNS & automated TLS (`tool:init --tool=external-dns`).
     *
     * @return list<string>
     */
    public static function connectableValues(): array
    {
        return [
            self::CLOUDFLARE->value,
            self::ROUTE53->value,
            self::GOOGLE->value,
        ];
    }
}
