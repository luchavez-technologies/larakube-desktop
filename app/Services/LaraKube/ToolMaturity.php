<?php

namespace App\Services\LaraKube;

use Laravel\Pennant\Feature;

/**
 * Which tools, frameworks, and features are still being battle-tested, so
 * the UI can say so. The flags themselves are defined once, in
 * AppServiceProvider::configureMaturityFlags() — this just reads them.
 */
class ToolMaturity
{
    /**
     * @return array{tools: list<string>, frameworks: list<string>, capabilities: list<string>, dns_providers: list<string>}
     */
    public function untested(): array
    {
        return [
            'tools' => $this->slugs(Feature::value('untested-tools')),
            'frameworks' => $this->slugs(Feature::value('untested-frameworks')),
            'capabilities' => $this->slugs(Feature::value('untested-capabilities')),
            'dns_providers' => $this->slugs(Feature::value('untested-dns-providers')),
        ];
    }

    /**
     * @return list<string>
     */
    private function slugs(mixed $value): array
    {
        return is_array($value) ? array_values(array_filter($value, 'is_string')) : [];
    }
}
