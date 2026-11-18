import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Archive, ArrowRightLeft, Layers, Trash2 } from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import ConfirmModal from '@/components/confirm-modal';
import StatusPill from '@/components/status-pill';

type KubernetesTabProps = {
    contexts?: string[];
    currentContext?: string | null;
};

export default function KubernetesTab({
    contexts = [],
    currentContext = null,
}: KubernetesTabProps) {
    const [contextToRemove, setContextToRemove] = useState<string | null>(null);

    function switchContext(name: string) {
        router.post('/context/switch', { context: name });
    }

    function removeContext(name: string) {
        setContextToRemove(name);
    }

    function confirmRemoveContext() {
        if (!contextToRemove) return;
        const target = contextToRemove;
        setContextToRemove(null);
        router.post('/context/remove', { context: target });
    }

    function backupContexts() {
        router.post('/context/backup');
    }

    return (
        <div className="space-y-5">
            <Card
                label="Kubernetes Contexts"
                action={
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={backupContexts}
                        title="Backup ~/.kube/config"
                    >
                        <Archive className="size-3.5" />
                        <span>Backup</span>
                    </Button>
                }
            >
                <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-soft">
                        Clusters found in your local kubeconfig. LaraKube
                        orchestrates against the active context.
                    </p>

                    {contexts.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-soft">
                            No Kubernetes contexts detected.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {contexts.map((c) => {
                                const isActive = c === currentContext;
                                return (
                                    <div
                                        key={c}
                                        className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                                            isActive
                                                ? 'border-brand/30 bg-brand/5 shadow-xs'
                                                : 'border-line bg-paper'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <Layers className="size-3.5 shrink-0 text-soft" />
                                                <span
                                                    className="truncate font-mono text-[11px] font-medium text-ink"
                                                    title={c}
                                                >
                                                    {c}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1.5">
                                            {isActive ? (
                                                <StatusPill tone="ok">
                                                    Active
                                                </StatusPill>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() =>
                                                        switchContext(c)
                                                    }
                                                    title="Switch to this context"
                                                >
                                                    <ArrowRightLeft className="size-3" />
                                                    <span>Switch</span>
                                                </Button>
                                            )}

                                            {!isActive && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-danger hover:text-danger hover:bg-danger/10 px-2"
                                                    onClick={() =>
                                                        removeContext(c)
                                                    }
                                                    title="Remove context"
                                                >
                                                    <Trash2 className="size-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>

            <ConfirmModal
                isOpen={contextToRemove !== null}
                onClose={() => setContextToRemove(null)}
                onConfirm={confirmRemoveContext}
                title="Remove Kubernetes context?"
                description={
                    <>
                        Are you sure you want to remove context{' '}
                        <code className="rounded bg-paper px-1 py-0.5 font-mono text-ink">
                            {contextToRemove}
                        </code>{' '}
                        from{' '}
                        <code className="font-mono text-ink">
                            ~/.kube/config
                        </code>
                        ?
                    </>
                }
                confirmLabel="Remove Context"
                tone="danger"
                icon={<Trash2 className="size-5" />}
                confirmIcon={<Trash2 className="size-3.5" />}
            />
        </div>
    );
}
