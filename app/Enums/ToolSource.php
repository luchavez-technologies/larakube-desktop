<?php

namespace App\Enums;

enum ToolSource: string
{
    case OFFICIAL = 'official';
    case COMMUNITY = 'community';

    public function label(): string
    {
        return match ($this) {
            self::OFFICIAL => 'Official',
            self::COMMUNITY => 'Community',
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
