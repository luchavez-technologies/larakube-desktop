<?php

namespace App\Enums;

enum DatabaseDriver: string
{
    case POSTGRESQL = 'postgresql';
    case MYSQL = 'mysql';
    case MARIADB = 'mariadb';
    case SQLITE = 'sqlite';

    public function label(): string
    {
        return match ($this) {
            self::POSTGRESQL => 'PostgreSQL',
            self::MYSQL => 'MySQL',
            self::MARIADB => 'MariaDB',
            self::SQLITE => 'SQLite (Standalone)',
        };
    }

    public function plexLabel(): string
    {
        return match ($this) {
            self::POSTGRESQL => 'Plex PostgreSQL',
            self::MYSQL => 'Plex MySQL',
            self::MARIADB => 'Plex MariaDB',
            self::SQLITE => 'SQLite (Standalone)',
        };
    }

    /**
     * The service slug used by `plex:init --services=` and `plex:show --json`.
     */
    public function plexServiceKey(): ?string
    {
        return match ($this) {
            self::POSTGRESQL => 'postgres',
            self::MYSQL => 'mysql',
            self::MARIADB => 'mariadb',
            self::SQLITE => null,
        };
    }

    public static function fromPlexService(string $service): ?self
    {
        return match (strtolower(trim($service))) {
            'postgres', 'postgresql' => self::POSTGRESQL,
            'mysql' => self::MYSQL,
            'mariadb' => self::MARIADB,
            'sqlite' => self::SQLITE,
            default => null,
        };
    }

    /**
     * @return list<self>
     */
    public static function plexDrivers(): array
    {
        return [self::POSTGRESQL, self::MYSQL, self::MARIADB];
    }

    /**
     * @return list<string>
     */
    public static function plexValues(): array
    {
        return array_map(fn (self $case): string => $case->value, self::plexDrivers());
    }
}
