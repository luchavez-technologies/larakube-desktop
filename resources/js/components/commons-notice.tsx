import { Database } from 'lucide-react';
import type {
    CommonsState,
    FrameworkField,
    NewAppAnswers,
} from '@/types/larakube';

type Shared = { service: string; what: string };

/**
 * What the chosen options would share on the Commons: one entry per distinct
 * service, named by the field it answers and the option picked.
 */
function sharedServices(
    fields: FrameworkField[],
    answers: NewAppAnswers,
): Shared[] {
    const shared = new Map<string, Shared>();

    for (const field of fields) {
        const picked = answers[field.key];
        const values = Array.isArray(picked) ? picked : [picked];

        for (const option of field.options ?? []) {
            if (option.commons && values.includes(option.value)) {
                shared.set(option.commons, {
                    service: option.commons,
                    what: `${option.label} (${field.label.toLowerCase()})`,
                });
            }
        }
    }

    return [...shared.values()];
}

/**
 * Says, before anything runs, whether the new app will join the shared Commons
 * and what that starts on this computer. Renders nothing for frameworks that
 * have no opt-out field, since those never join.
 */
export default function CommonsNotice({
    fields,
    answers,
    commons,
}: {
    fields: FrameworkField[];
    answers: NewAppAnswers;
    commons: CommonsState | undefined;
}) {
    const optOut = fields.find((field) => field.role === 'commons-opt-out');

    if (!optOut) return null;

    const shared = sharedServices(fields, answers);

    if (shared.length === 0) return null;

    const selfContained = answers[optOut.key] === true;
    const list = (items: Shared[]) => items.map((s) => s.what).join(', ');
    const running = shared.filter(
        (s) => commons?.initialized && commons.services[s.service]?.enabled,
    );
    const toStart = shared.filter((s) => !running.includes(s));

    let title: string;
    let body: string;

    if (selfContained) {
        title = 'This app will run its own copies';
        body = `${list(shared)} start inside this app's own project instead of the shared Commons.`;
    } else if (commons === undefined) {
        title = 'Checking your Commons…';
        body = '';
    } else if (commons === null) {
        title = 'This app will use the shared Commons';
        body = `${list(shared)}. Desktop couldn't reach your local cluster to check it. If the Commons isn't running, creating the app starts it first.`;
    } else if (toStart.length === 0) {
        title = 'This app will join your running Commons';
        body = `${list(shared)} already run there. The app gets its own database and login on it, so its data stays separate from your other apps.`;
    } else {
        title = commons.initialized
            ? 'Creating this app starts part of your Commons first'
            : 'Creating this app sets up your Commons first';
        body = `${list(toStart)} will be started on this computer${running.length > 0 ? ` (${list(running)} already run)` : ''}. The Commons is one shared set of services that all your apps use, so each app doesn't run its own copies and your computer stays light. It keeps running in the background.`;
    }

    return (
        <div className="flex gap-3 rounded-lg bg-paper p-3.5 text-xs leading-relaxed ring-1 ring-line ring-inset">
            <Database className="mt-0.5 size-4 shrink-0 text-soft" />
            <div>
                <p className="font-medium text-ink">{title}</p>
                {body && <p className="mt-0.5 text-soft">{body}</p>}
                {!selfContained && (
                    <p className="mt-1 text-soft">
                        Prefer the app to be on its own? Tick &ldquo;
                        {optOut.label}&rdquo;.
                    </p>
                )}
            </div>
        </div>
    );
}
