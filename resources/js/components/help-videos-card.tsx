import { useEffect, useState } from 'react';
import { ExternalLink, PlayCircle, X } from 'lucide-react';
import { SiYoutube } from '@icons-pack/react-simple-icons';
import Card from '@/components/card';
import { buttonClass } from '@/components/button';
import { ExternalLinkButton } from '@/lib/open-external';

export type HowToVideo = {
    title: string;
    /** The `v=` value from the video's YouTube URL. */
    youtubeId: string;
    description?: string;
};

/**
 * Bundled fallback list — shown instantly on first paint, and whenever the
 * live playlist fetch (HelpController's `howToVideos` deferred prop) comes
 * back empty or the machine has no connectivity. Keep this in sync with
 * the actual playlist by hand; it's the safety net, not the source of truth.
 */
export const HOW_TO_VIDEOS: HowToVideo[] = [
    {
        title: 'LaraKube Desktop: Deploy a Kubernetes Server in 3 Minutes',
        youtubeId: '9qw4NPD-Jz4',
        description:
            'Deploy a single-node k3s Kubernetes cluster on GCP with automated DNS and wildcard SSL certificates in 3 minutes.',
    },
    {
        title: 'LaraKube Desktop: Install n8n with One Click',
        youtubeId: 'kO4ouF1c0zc',
        description:
            'Deploy an n8n workflow automation instance with custom domains and automated SSL in under a minute.',
    },
    {
        title: 'LaraKube Desktop: Install PocketBase (Self-Hosted Backend) in One Click',
        youtubeId: 'aj7jBycASs4',
        description:
            'Deploy a PocketBase backend with its own embedded database, auth, and file storage, with DNS and SSL handled automatically.',
    },
    {
        title: 'LaraKube Desktop: Install WordPress (Zero-Config CMS) in One Click',
        youtubeId: 'W-pbvrJv8Fk',
        description:
            'Deploy WordPress with its MySQL database, admin login, and SSL ready to go — no manual config needed.',
    },
];

/** Set once the playlist exists, so "Watch full playlist" has somewhere to go. */
export const HOW_TO_PLAYLIST_URL: string | null =
    'https://www.youtube.com/@luchtechdotdev/videos';

function youtubeWatchUrl(youtubeId: string): string {
    return `https://www.youtube.com/watch?v=${youtubeId}`;
}

function youtubeThumbnailUrl(youtubeId: string): string {
    return `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
}

function HowToVideoThumbnail({
    video,
    onPlay,
}: {
    video: HowToVideo;
    onPlay: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPlay}
            className="group block w-full cursor-pointer text-left"
        >
            <span className="relative block aspect-video w-full overflow-hidden rounded-xl bg-paper ring-1 ring-line">
                <img
                    src={youtubeThumbnailUrl(video.youtubeId)}
                    alt={video.title}
                    className="size-full object-cover transition duration-300 group-hover:scale-105 group-hover:opacity-90"
                    loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition duration-300 group-hover:bg-black/40">
                    <span className="flex size-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-xs transition duration-200 group-hover:scale-110 group-hover:bg-[#FF0000]">
                        <PlayCircle className="size-7" />
                    </span>
                </span>
            </span>
            <span className="mt-2 line-clamp-1 block text-xs font-medium text-ink transition group-hover:text-brand">
                {video.title}
            </span>
            {video.description ? (
                <span className="mt-0.5 line-clamp-2 block text-[11px] text-soft">
                    {video.description}
                </span>
            ) : null}
        </button>
    );
}

function HowToVideosEmptyState() {
    return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-paper px-4 py-10 text-center">
            <SiYoutube className="size-7 text-faint" />
            <p className="text-xs font-medium text-ink">
                Video walkthroughs are coming soon
            </p>
            <p className="max-w-xs text-[11px] text-soft">
                We're filming a &quot;How To&apos;s&quot; playlist covering
                common LaraKube workflows. This space will fill in as videos go
                live.
            </p>
        </div>
    );
}

export default function HelpVideosCard({
    videos,
}: {
    /** Live-fetched playlist from the server; undefined while loading, null/empty falls back to HOW_TO_VIDEOS. */
    videos?: HowToVideo[] | null;
}) {
    const [playingVideo, setPlayingVideo] = useState<HowToVideo | null>(null);
    const activeVideos = videos && videos.length > 0 ? videos : HOW_TO_VIDEOS;

    useEffect(() => {
        if (!playingVideo) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setPlayingVideo(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [playingVideo]);

    return (
        <>
            <Card
                label="How-To Videos"
                action={
                    HOW_TO_PLAYLIST_URL ? (
                        <ExternalLinkButton
                            url={HOW_TO_PLAYLIST_URL}
                            className={buttonClass('secondary', 'sm')}
                        >
                            <ExternalLink className="size-3.5" />
                            <span>More videos</span>
                        </ExternalLinkButton>
                    ) : undefined
                }
            >
                {activeVideos.length === 0 ? (
                    <HowToVideosEmptyState />
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {activeVideos.map((video) => (
                            <HowToVideoThumbnail
                                key={video.youtubeId}
                                video={video}
                                onPlay={() => setPlayingVideo(video)}
                            />
                        ))}
                    </div>
                )}
            </Card>

            {playingVideo && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
                    onClick={() => setPlayingVideo(null)}
                >
                    <div
                        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-paper shadow-2xl ring-1 ring-line"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-line px-4 py-3">
                            <div className="min-w-0 flex-1 pr-4">
                                <h3 className="truncate text-sm font-semibold text-ink">
                                    {playingVideo.title}
                                </h3>
                                {playingVideo.description && (
                                    <p className="truncate text-xs text-soft">
                                        {playingVideo.description}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <ExternalLinkButton
                                    url={youtubeWatchUrl(
                                        playingVideo.youtubeId,
                                    )}
                                    className={buttonClass('secondary', 'xs')}
                                >
                                    <ExternalLink className="size-3.5" />
                                    <span>Watch on YouTube</span>
                                </ExternalLinkButton>
                                <button
                                    type="button"
                                    onClick={() => setPlayingVideo(null)}
                                    className="hover:bg-hover cursor-pointer rounded-lg p-1 text-soft transition hover:text-ink"
                                    aria-label="Close"
                                >
                                    <X className="size-5" />
                                </button>
                            </div>
                        </div>
                        <div className="aspect-video w-full bg-black">
                            <iframe
                                src={`https://www.youtube.com/embed/${playingVideo.youtubeId}?autoplay=1`}
                                title={playingVideo.title}
                                className="size-full border-0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
