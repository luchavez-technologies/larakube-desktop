<?php

namespace App\Enums;

enum ToolCategory: string
{
    case DATABASE = 'database';
    case BACKEND = 'backend';
    case AUTH = 'auth';
    case SECURITY = 'security';
    case COMMUNICATION = 'communication';
    case OBSERVABILITY = 'observability';
    case PRODUCTIVITY = 'productivity';
    case DEVOPS = 'devops';
    case ANALYTICS = 'analytics';
    case STORAGE = 'storage';

    public function label(): string
    {
        return match ($this) {
            self::DATABASE => 'Database',
            self::BACKEND => 'Backend & CMS',
            self::AUTH => 'Auth & Identity',
            self::SECURITY => 'Security & Secrets',
            self::COMMUNICATION => 'Communication',
            self::OBSERVABILITY => 'Observability & Metrics',
            self::PRODUCTIVITY => 'Productivity & Office',
            self::DEVOPS => 'DevOps & CI/CD',
            self::ANALYTICS => 'Analytics & BI',
            self::STORAGE => 'Storage & S3',
        };
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $case): string => $case->value, self::cases());
    }
}
