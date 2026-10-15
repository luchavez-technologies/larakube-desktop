import { Form } from '@inertiajs/react';
import { useState } from 'react';
import {
    Sparkles,
    Check,
    Download,
    Trash2,
    Layers,
    FileText,
    Boxes,
    Plus,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import type { DriveExtension, Server as ServerType } from '@/types/larakube';

type Props = {
    server: ServerType;
    extensions?: DriveExtension[];
};

export default function ExtensionsTab({ server, extensions = [] }: Props) {
    const [customExtension, setCustomExtension] = useState('');

    const categoryIcon = (category: string) => {
        switch (category.toLowerCase()) {
            case 'diagrams':
                return <Layers className="h-4 w-4 text-violet-500" />;
            case 'media':
                return <Boxes className="h-4 w-4 text-sky-500" />;
            case 'documents':
                return <FileText className="h-4 w-4 text-emerald-500" />;
            default:
                return <Sparkles className="h-4 w-4 text-amber-500" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-base font-semibold tracking-tight text-ink">
                        Web Extensions Catalog
                    </h3>
                    <p className="text-xs text-soft">
                        Curated in-browser extensions seamlessly mounted into
                        ownCloud Web.
                    </p>
                </div>
            </div>

            {/* Extensions Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {extensions.map((ext) => (
                    <div
                        key={ext.id}
                        className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs transition hover:border-line/80"
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-paper ring-1 ring-line">
                                        {categoryIcon(ext.category)}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-ink">
                                            {ext.name}
                                        </h4>
                                        <span className="font-mono text-[10px] text-soft">
                                            {ext.version}
                                        </span>
                                    </div>
                                </div>

                                <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-medium text-soft ring-1 ring-line">
                                    {ext.category}
                                </span>
                            </div>

                            <p className="mt-3 text-xs leading-relaxed text-soft">
                                {ext.description}
                            </p>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-line/60 pt-4">
                            {ext.installed ? (
                                <>
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                        <Check className="h-3.5 w-3.5" />
                                        Installed
                                    </span>

                                    <Form
                                        action={`/servers/${server.name}/drive/extensions/uninstall`}
                                        method="post"
                                    >
                                        <input
                                            type="hidden"
                                            name="extension"
                                            value={ext.id}
                                        />
                                        <Button
                                            type="submit"
                                            variant="ghost"
                                            size="sm"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                            <span className="text-rose-500">
                                                Uninstall
                                            </span>
                                        </Button>
                                    </Form>
                                </>
                            ) : (
                                <>
                                    <span className="text-muted text-xs">
                                        Not installed
                                    </span>

                                    <Form
                                        action={`/servers/${server.name}/drive/extensions/install`}
                                        method="post"
                                    >
                                        <input
                                            type="hidden"
                                            name="extension"
                                            value={ext.id}
                                        />
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            size="sm"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                            Install
                                        </Button>
                                    </Form>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Custom Extension Input Card */}
            <Card label="Install Custom Web Extension">
                <div className="space-y-3 pt-2 text-xs">
                    <p className="text-soft">
                        Enter an official ownCloud web extension ID or a direct
                        HTTP URL pointing to an extension bundle:
                    </p>

                    <Form
                        action={`/servers/${server.name}/drive/extensions/install`}
                        method="post"
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    >
                        <input
                            type="text"
                            name="extension"
                            value={customExtension}
                            onChange={(e) => setCustomExtension(e.target.value)}
                            placeholder="e.g. com.github.user.custom-extension"
                            className="placeholder:text-muted flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            required
                        />
                        <Button type="submit" variant="primary" size="sm">
                            <Plus className="h-4 w-4" />
                            Install Extension
                        </Button>
                    </Form>
                </div>
            </Card>
        </div>
    );
}
