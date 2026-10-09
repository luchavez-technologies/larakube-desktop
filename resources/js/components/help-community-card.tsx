import { Link } from '@inertiajs/react';
import { Mail } from 'lucide-react';
import {
    SiDiscord,
    SiFacebook,
    SiGithub,
    SiInstagram,
} from '@icons-pack/react-simple-icons';
import type { ReactNode } from 'react';
import Card from '@/components/card';
import { open } from '@/routes';

function LinkedInIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
    );
}

type HelpLink = {
    label: string;
    detail: string;
    href: string;
    icon: ReactNode;
};

const GET_HELP: HelpLink[] = [
    {
        label: 'Discord',
        detail: 'Ask questions, share what you built',
        href: 'https://discord.gg/tmB5rm6FEf',
        icon: <SiDiscord className="size-4" color="#5865F2" />,
    },
    {
        label: 'help@larakube.app',
        detail: 'Product support',
        href: 'mailto:help@larakube.app',
        icon: <Mail className="size-4 text-soft" />,
    },
    {
        label: 'help@luchtech.dev',
        detail: 'General / company inquiries',
        href: 'mailto:help@luchtech.dev',
        icon: <Mail className="size-4 text-soft" />,
    },
];

const SOURCE: HelpLink[] = [
    {
        label: 'larakube-desktop',
        detail: 'This app',
        href: 'https://github.com/luchavez-technologies/larakube-desktop',
        icon: <SiGithub className="size-4 text-soft" />,
    },
    {
        label: 'larakube-cli',
        detail: 'The CLI it runs',
        href: 'https://github.com/luchavez-technologies/larakube-cli',
        icon: <SiGithub className="size-4 text-soft" />,
    },
];

const FOLLOW: HelpLink[] = [
    {
        label: 'Facebook',
        detail: 'facebook.luchtech.dev',
        href: 'https://facebook.luchtech.dev',
        icon: <SiFacebook className="size-4" color="#0866FF" />,
    },
    {
        label: 'LinkedIn',
        detail: 'linkedin.luchtech.dev',
        href: 'https://linkedin.luchtech.dev',
        icon: <LinkedInIcon className="size-4 text-[#0A66C2]" />,
    },
    {
        label: 'Instagram',
        detail: 'instagram.luchtech.dev',
        href: 'https://instagram.luchtech.dev',
        icon: <SiInstagram className="size-4" color="#E4405F" />,
    },
];

function HelpLinkRow({ link }: { link: HelpLink }) {
    return (
        <Link
            href={open().url}
            method="post"
            data={{ url: link.href }}
            as="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-paper"
        >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-badge">
                {link.icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-ink">
                    {link.label}
                </span>
                <span className="block truncate text-[10px] text-soft">
                    {link.detail}
                </span>
            </span>
        </Link>
    );
}

export default function HelpCommunityCard() {
    return (
        <Card label="Help & Community">
            <div className="space-y-3">
                <div>
                    <p className="mb-1 px-2.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                        Get help
                    </p>
                    {GET_HELP.map((link) => (
                        <HelpLinkRow key={link.label} link={link} />
                    ))}
                </div>
                <div className="border-t border-line/60 pt-2">
                    <p className="mb-1 px-2.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                        Source code
                    </p>
                    {SOURCE.map((link) => (
                        <HelpLinkRow key={link.label} link={link} />
                    ))}
                </div>
                <div className="border-t border-line/60 pt-2">
                    <p className="mb-1 px-2.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                        Follow us
                    </p>
                    {FOLLOW.map((link) => (
                        <HelpLinkRow key={link.label} link={link} />
                    ))}
                </div>
            </div>
        </Card>
    );
}
