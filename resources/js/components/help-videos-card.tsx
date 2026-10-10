import { Link } from '@inertiajs/react';
import { ExternalLink, PlayCircle } from 'lucide-react';
import { SiYoutube } from '@icons-pack/react-simple-icons';
import Card from '@/components/card';
import { buttonClass } from '@/components/button';
import { open } from '@/routes';

export type HowToVideo = {
    title: string;
    /** The `v=` value from the video's YouTube URL. */
    youtubeId: string;
    description?: string;
};

/**
 * The "How To's" playlist is still being filmed — add entries here once
 * videos are published. Each one only needs its title and YouTube ID; the
 * thumbnail and link are derived automatically.
 */
export const HOW_TO_VIDEOS: HowToVideo[] = [];

/** Set once the playlist exists, so "Watch full playlist" has somewhere to go. */
export const HOW_TO_PLAYLIST_URL: string | null = null;

function youtubeWatchUrl(youtubeId: string): string {
    return `https://www.youtube.com/watch?v=${youtubeId}`;
}

function youtubeThumbnailUrl(youtubeId: string): string {
    return `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
}

function HowToVideoThumbnail({ video }: { video: HowToVideo }) {
    return (
        <Link
            href={open().url}
            method="post"
            data={{ url: youtubeWatchUrl(video.youtubeId) }}
            as="button"
            className="group block w-full text-left"
        >
            <span className="relative block aspect-video w-full overflow-hidden rounded-xl bg-paper ring-1 ring-line">
                <img
                    src={youtubeThumbnailUrl(video.youtubeId)}
                    alt=""
                    className="size-full object-cover transition group-hover:opacity-90"
                    loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                    <PlayCircle className="size-9 text-white opacity-90 drop-shadow-sm transition group-hover:scale-110 group-hover:opacity-100" />
                </span>
            </span>
            <span className="mt-1.5 block truncate text-xs font-medium text-ink">
                {video.title}
            </span>
            {video.description ? (
                <span className="block truncate text-[10px] text-soft">
                    {video.description}
                </span>
            ) : null}
        </Link>
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
                We're filming a "How To's" playlist covering common LaraKube
                workflows. This space will fill in as videos go live.
            </p>
        </div>
    );
}

export default function HelpVideosCard() {
    return (
        <Card
            label="How-To Videos"
            action={
                HOW_TO_PLAYLIST_URL ? (
                    <Link
                        href={open().url}
                        method="post"
                        data={{ url: HOW_TO_PLAYLIST_URL }}
                        as="button"
                        className={buttonClass('secondary', 'sm')}
                    >
                        <ExternalLink className="size-3.5" />
                        <span>Watch full playlist</span>
                    </Link>
                ) : undefined
            }
        >
            {HOW_TO_VIDEOS.length === 0 ? (
                <HowToVideosEmptyState />
            ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {HOW_TO_VIDEOS.map((video) => (
                        <HowToVideoThumbnail
                            key={video.youtubeId}
                            video={video}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
}
