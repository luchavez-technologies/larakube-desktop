import { Link } from '@inertiajs/react';
import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import { buttonClass } from '@/components/button';
import Card from '@/components/card';
import {
    ConnectionDetails,
    companionFits,
} from '@/components/local-dev-companions-card';
import ToolLogo from '@/components/tool-logo';
import { ExternalLinkButton } from '@/lib/open-external';
import { index as localIndex } from '@/routes/local';
import type {
    CompanionApp,
    CompanionCredential,
    Project,
} from '@/types/larakube';

/**
 * How to reach this project's data with the shared dev companions: this
 * project's own connection details for each running one, and an Open button.
 * Installing and managing companions happens on the Local page, since one
 * install serves every project.
 */
export default function ProjectConnectCard({
    project,
    companions,
    companionCredentials,
}: {
    project: Project;
    companions?: CompanionApp[] | null;
    companionCredentials?: CompanionCredential[] | null;
}) {
    const manage = (
        <Link
            href={localIndex().url}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
            Manage companions in Local Dev
            <ArrowRight className="size-3" />
        </Link>
    );

    const credentials = companionCredentials ?? [];
    const slugOf = (name: string): string =>
        (companions ?? []).find((companion) => companion.name === name)?.slug ??
        name.toLowerCase();
    const suggestions = (companions ?? []).filter(
        (companion) =>
            !companion.installed &&
            companionFits(
                companion.slug,
                project.database,
                project.cacheDriver,
            ),
    );

    return (
        <Card label="Connect" action={manage}>
            {credentials.length === 0 ? (
                <p className="text-xs text-soft">
                    No dev companion is running for this project yet.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {credentials.map((credential) => (
                        <div
                            key={credential.companion}
                            className="rounded-xl bg-paper/60 p-3 ring-1 ring-line/70"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <ToolLogo
                                        slug={slugOf(credential.companion)}
                                        size="sm"
                                    />
                                    <span className="truncate text-sm font-medium text-ink">
                                        {credential.companion}
                                    </span>
                                </div>
                                <ExternalLinkButton
                                    url={credential.url}
                                    className={buttonClass(
                                        'secondary',
                                        'sm',
                                        'gap-1',
                                    )}
                                >
                                    <ExternalLink className="size-3" />
                                    <span>Open</span>
                                </ExternalLinkButton>
                            </div>
                            <div className="mt-2">
                                <ConnectionDetails credential={credential} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {suggestions.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-soft">
                    <Sparkles className="size-3 text-brand" />
                    {suggestions
                        .map((companion) => companion.name)
                        .join(', ')}{' '}
                    {suggestions.length === 1 ? 'suits' : 'suit'} this project.
                    Install from{' '}
                    <Link
                        href={localIndex().url}
                        className="font-medium text-brand hover:underline"
                    >
                        Local Dev
                    </Link>
                    .
                </p>
            )}
        </Card>
    );
}
