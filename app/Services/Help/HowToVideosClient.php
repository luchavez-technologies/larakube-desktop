<?php

namespace App\Services\Help;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Fetches the LaraKube Desktop "How-To" YouTube playlist so the in-app Help
 * page stays current without an app release per episode — same playlist and
 * RSS-feed approach as docs.larakube.app and the portfolio site. Caches
 * the parsed result; HelpController falls back to the Desktop app's own
 * bundled static list (help-videos-card.tsx) whenever this returns null, so
 * a network hiccup or offline laptop never breaks the Help page itself —
 * the videos simply can't be played either way without connectivity.
 */
class HowToVideosClient
{
    public const PLAYLIST_ID = 'PLA7VUwI0KNjI';

    private const CACHE_KEY = 'help.how-to-videos';

    /**
     * @return list<array{title: string, youtubeId: string}>|null
     */
    public function getVideos(): ?array
    {
        return Cache::remember(self::CACHE_KEY, now()->addHour(), function (): ?array {
            try {
                $response = Http::timeout(5)->get(
                    'https://www.youtube.com/feeds/videos.xml',
                    ['playlist_id' => self::PLAYLIST_ID],
                );

                if (! $response->successful()) {
                    return null;
                }

                $videos = $this->parse($response->body());

                return $videos === [] ? null : $videos;
            } catch (\Throwable $e) {
                Log::debug('HowToVideosClient: failed to fetch playlist feed', [
                    'error' => $e->getMessage(),
                ]);

                return null;
            }
        });
    }

    /**
     * @return list<array{title: string, youtubeId: string}>
     */
    private function parse(string $xml): array
    {
        $previous = libxml_use_internal_errors(true);

        try {
            $feed = simplexml_load_string($xml, \SimpleXMLElement::class, 0, 'http://www.w3.org/2005/Atom');
            if ($feed === false) {
                return [];
            }

            $videos = [];

            foreach ($feed->entry as $entry) {
                $entryYt = $entry->children('http://www.youtube.com/xml/schemas/2015');
                $videoId = (string) $entryYt->videoId;
                $title = (string) $entry->title;

                if ($videoId === '' || $title === '') {
                    continue;
                }

                $videos[] = [
                    'title' => preg_replace('/^LaraKube Desktop:\s*/', '', $title) ?? $title,
                    'youtubeId' => $videoId,
                ];
            }

            return $videos;
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }
}
