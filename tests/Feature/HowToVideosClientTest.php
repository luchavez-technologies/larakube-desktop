<?php

use App\Services\Help\HowToVideosClient;
use Illuminate\Support\Facades\Http;

function fakePlaylistFeed(): string
{
    return <<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>LaraKube Desktop</title>
 <entry>
  <yt:videoId>9qw4NPD-Jz4</yt:videoId>
  <title>LaraKube Desktop: Deploy a Kubernetes Server in 3 Minutes</title>
 </entry>
 <entry>
  <yt:videoId>kO4ouF1c0zc</yt:videoId>
  <title>LaraKube Desktop: Install n8n with One Click</title>
 </entry>
</feed>
XML;
}

test('fetches and parses the playlist feed, stripping the brand prefix', function () {
    Http::fake([
        'https://www.youtube.com/feeds/videos.xml*' => Http::response(fakePlaylistFeed(), 200),
    ]);

    $videos = (new HowToVideosClient)->getVideos();

    expect($videos)->toBe([
        ['title' => 'Deploy a Kubernetes Server in 3 Minutes', 'youtubeId' => '9qw4NPD-Jz4'],
        ['title' => 'Install n8n with One Click', 'youtubeId' => 'kO4ouF1c0zc'],
    ]);
});

test('returns null when the feed request fails', function () {
    Http::fake([
        'https://www.youtube.com/feeds/videos.xml*' => Http::response('', 500),
    ]);

    expect((new HowToVideosClient)->getVideos())->toBeNull();
});

test('returns null when the connection throws (offline)', function () {
    Http::fake([
        'https://www.youtube.com/feeds/videos.xml*' => function () {
            throw new Exception('Connection refused');
        },
    ]);

    expect((new HowToVideosClient)->getVideos())->toBeNull();
});

test('returns null for a feed with no entries', function () {
    Http::fake([
        'https://www.youtube.com/feeds/videos.xml*' => Http::response(
            '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>LaraKube Desktop</title></feed>',
            200,
        ),
    ]);

    expect((new HowToVideosClient)->getVideos())->toBeNull();
});

test('caches the result so a second call does not refetch', function () {
    Http::fake([
        'https://www.youtube.com/feeds/videos.xml*' => Http::response(fakePlaylistFeed(), 200),
    ]);

    $client = new HowToVideosClient;
    $client->getVideos();
    $client->getVideos();

    Http::assertSentCount(1);
});
