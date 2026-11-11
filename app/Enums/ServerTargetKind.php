<?php

namespace App\Enums;

enum ServerTargetKind: string
{
    case VPS = 'vps';
    case MANAGED = 'managed';

    public function label(): string
    {
        return match ($this) {
            self::VPS => 'Single-node VPS',
            self::MANAGED => 'Managed Kubernetes (GKE / DOKS / EKS)',
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
