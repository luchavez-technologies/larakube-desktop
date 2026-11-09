import { Form } from '@inertiajs/react';
import type { InertiaFormProps } from '@inertiajs/react';
import { Check, Heart, Laptop, Moon, RotateCw, Sun } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import EditorLogo from '@/components/editor-logo';
import SelectMenu from '@/components/select-menu';
import SponsorButton from '@/components/sponsor-button';
import { cn } from '@/lib/utils';
import type { Editor } from '@/types/larakube';
import type { SettingsForm, ThemeMode } from './types';

const themeOptions: {
    id: ThemeMode;
    label: string;
    description: string;
    icon: typeof Laptop;
}[] = [
    {
        id: 'system',
        label: 'System',
        description: 'Sync with OS theme',
        icon: Laptop,
    },
    {
        id: 'light',
        label: 'Light',
        description: 'Crisp light mode',
        icon: Sun,
    },
    {
        id: 'dark',
        label: 'Dark',
        description: 'High-contrast dark mode',
        icon: Moon,
    },
];

type GeneralTabProps = {
    form: InertiaFormProps<SettingsForm>;
    allowedTlds: string[];
    availableEditors: Editor[];
    allEditors: Editor[];
    activeTheme: ThemeMode;
    selectTheme: (theme: ThemeMode) => void;
    saveAction: React.ReactNode;
};

export default function GeneralTab({
    form,
    allowedTlds,
    availableEditors,
    allEditors,
    activeTheme,
    selectTheme,
    saveAction,
}: GeneralTabProps) {
    const availableSlugs = new Set(availableEditors.map((e) => e.slug));
    const editorsList = allEditors.length > 0 ? allEditors : availableEditors;

    return (
        <div className="space-y-5">
            {/* Appearance & Theme */}
            <Card label="Appearance & Theme" action={saveAction}>
                <div className="space-y-3">
                    <p className="text-xs text-soft">
                        Choose your interface theme preference. System
                        automatically synchronizes with your operating system's
                        light or dark mode.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                        {themeOptions.map((option) => {
                            const Icon = option.icon;
                            const isSelected = activeTheme === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => selectTheme(option.id)}
                                    className={cn(
                                        'group relative flex flex-col items-start gap-2.5 rounded-xl border p-3.5 text-left transition-all',
                                        isSelected
                                            ? 'border-brand/60 bg-brand/[0.04] shadow-xs ring-1 ring-brand/40'
                                            : 'hover:border-line-hover border-line bg-surface shadow-2xs hover:bg-paper/60',
                                    )}
                                >
                                    <div className="flex w-full items-center justify-between">
                                        <div
                                            className={cn(
                                                'flex size-8 items-center justify-center rounded-lg border transition-colors',
                                                isSelected
                                                    ? 'border-brand/30 bg-brand/10 text-brand'
                                                    : 'border-line bg-paper text-soft group-hover:text-ink',
                                            )}
                                        >
                                            <Icon className="size-4" />
                                        </div>
                                        {isSelected && (
                                            <span className="flex size-5 items-center justify-center rounded-full bg-brand text-white">
                                                <Check className="size-3 stroke-[2.5]" />
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <span
                                            className={cn(
                                                'block text-xs font-semibold',
                                                isSelected
                                                    ? 'text-ink'
                                                    : 'text-soft group-hover:text-ink',
                                            )}
                                        >
                                            {option.label}
                                        </span>
                                        <span className="mt-0.5 block text-[11px] leading-relaxed text-soft">
                                            {option.description}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Card>

            {/* Default Code Editor & AI Agent */}
            <Card label="Default Code Editor & AI Agent" action={saveAction}>
                <div className="space-y-3">
                    <p className="text-xs text-soft">
                        Choose your preferred code editor or AI coding agent.
                        LaraKube will use this by default when opening projects
                        from the Menu Bar tray and quick launchers.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {editorsList.map((editor) => {
                            const isSelected =
                                form.data.defaultEditor === editor.slug;
                            const isInstalled = availableSlugs.has(editor.slug);
                            return (
                                <button
                                    key={editor.slug}
                                    type="button"
                                    onClick={() =>
                                        form.setData(
                                            'defaultEditor',
                                            editor.slug,
                                        )
                                    }
                                    className={cn(
                                        'group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                                        isSelected
                                            ? 'border-brand/60 bg-brand/[0.04] shadow-xs ring-1 ring-brand/40'
                                            : 'hover:border-line-hover border-line bg-surface shadow-2xs hover:bg-paper/60',
                                    )}
                                >
                                    <EditorLogo slug={editor.slug} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <span
                                            className={cn(
                                                'block truncate text-xs font-semibold',
                                                isSelected
                                                    ? 'text-ink'
                                                    : 'text-soft group-hover:text-ink',
                                            )}
                                        >
                                            {editor.label}
                                        </span>
                                        <span className="block text-[10px] text-faint">
                                            {editor.category === 'agent'
                                                ? 'AI Agent'
                                                : 'Editor'}
                                            {isInstalled ? ' • Installed' : ''}
                                        </span>
                                    </div>
                                    {isSelected && (
                                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                                            <Check className="size-2.5 stroke-[2.5]" />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="border-t border-line/60 pt-3">
                        <span className="text-xs text-soft">
                            Selected:{' '}
                            <strong className="font-semibold text-ink">
                                {editorsList.find(
                                    (e) => e.slug === form.data.defaultEditor,
                                )?.label ?? form.data.defaultEditor}
                            </strong>
                        </span>
                    </div>
                </div>
            </Card>

            {/* Local Domain & TLD */}
            <Card label="Local Domain & TLD" action={saveAction}>
                <div className="space-y-3">
                    <p className="text-xs text-soft">
                        Sets the local vanity domain suffix used by the LaraKube
                        cluster and Traefik ingress.
                    </p>
                    <div className="flex items-center gap-3">
                        <label className="text-xs font-medium text-ink">
                            Global Local TLD:
                        </label>
                        <SelectMenu
                            value={form.data.localTld}
                            triggerClassName="h-8 py-1.5 text-xs"
                            onChange={(value) =>
                                form.setData('localTld', value)
                            }
                            options={allowedTlds.map((tld) => ({
                                value: tld,
                                label: `.${tld}`,
                            }))}
                        />
                    </div>
                    <p className="text-[11px] text-soft">
                        Note: Projects can override this individually in their
                        project settings.
                    </p>
                </div>
            </Card>

            {/* Workspace Navigation Mode */}
            <Card label="Workspace Navigation Mode" action={saveAction}>
                <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-3">
                        <input
                            type="checkbox"
                            checked={form.data.hideProjects}
                            onChange={(e) =>
                                form.setData('hideProjects', e.target.checked)
                            }
                            className="mt-0.5 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                        />
                        <div>
                            <span className="block text-xs font-medium text-ink">
                                Hide Projects (Cluster Tools & Servers Only
                                Mode)
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                Streamlines the sidebar and fleet dashboard for
                                operators who exclusively manage servers,
                                Ingress, DNS, and Cluster Tools (PocketBase,
                                Vaultwarden, Uptime Kuma, Stalwart, etc.)
                                without application repos.
                            </span>
                        </div>
                    </label>

                    <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-3">
                        <div>
                            <span className="block text-xs font-medium text-ink">
                                Welcome wizard
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                                Redo the first-run questions (what you're using
                                LaraKube Desktop for, which cloud providers you
                                deploy to).
                            </span>
                        </div>
                        <Form method="post" action="/onboarding/reset">
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="secondary"
                                    size="sm"
                                    disabled={processing}
                                >
                                    <RotateCw className="size-3.5" />
                                    <span>Redo onboarding</span>
                                </Button>
                            )}
                        </Form>
                    </div>
                </div>
            </Card>

            {/* General & SSL */}
            <Card label="General & SSL" action={saveAction}>
                <div className="space-y-3">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-ink">
                            Default Let's Encrypt Email
                        </label>
                        <input
                            type="email"
                            value={form.data.email}
                            onChange={(e) =>
                                form.setData('email', e.target.value)
                            }
                            placeholder="dev@example.com"
                            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand"
                        />
                    </div>
                </div>
            </Card>

            {/* Support LaraKube Card */}
            <Card label="Support LaraKube">
                <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-soft">
                        LaraKube is open source software built and maintained by{' '}
                        <span className="font-semibold text-ink">LuchTech</span>
                        . Your sponsorship directly funds new cloud drivers,
                        security audits, and continuous features.
                    </p>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2.5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <Heart className="size-3.5 fill-[#ea4aaa]/20 text-[#ea4aaa]" />
                                <span className="truncate text-xs font-medium text-ink">
                                    GitHub Sponsors
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-soft">
                                Support luchavez-technologies
                            </p>
                        </div>
                        <SponsorButton />
                    </div>
                </div>
            </Card>
        </div>
    );
}
