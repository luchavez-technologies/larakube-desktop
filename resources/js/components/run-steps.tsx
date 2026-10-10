import { cn } from '@/lib/utils';
import type { RunStatus } from '@/types/larakube';

type Step = { label: string; done: RegExp; failed?: RegExp };

/**
 * cloud:create's phases, each marked done when its closing CLI message shows up
 * in the log. Matches log text, so it degrades to "unknown progress" rather than
 * breaking if a message changes. `failed` additionally catches a step whose OWN
 * failure text appears in the log — rendered red regardless of the overall run
 * status, since a sub-step can fail (e.g. Traefik) without the whole run exiting
 * non-zero (the cluster itself still provisioned and is usable).
 */
const SERVER_STEPS: Step[] = [
    { label: 'Provision', done: /Apply complete!/ },
    { label: 'Wait for SSH', done: /SSH is up/ },
    { label: 'Harden', done: /Hardened:/ },
    { label: 'Install k3s', done: /K3s installed\.|k3s is ready\./ },
    { label: 'Kubeconfig', done: /Kubeconfig synced/ },
    {
        label: 'Traefik',
        done: /Traefik deployed|Traefik is already installed/,
        failed: /Traefik deploy failed/,
    },
];

/** devbox:create: the same server work, then the local stack set up on the box. */
const DEV_BOX_STEPS: Step[] = [
    { label: 'Provision', done: /Apply complete!/ },
    { label: 'Wait for SSH', done: /SSH is up/ },
    { label: 'Harden', done: /Hardened:/ },
    { label: 'Install CLI', done: /Setting up Podman and a local cluster/ },
    { label: 'Podman and cluster', done: /Native k3s cluster is ready!/ },
];

/** cloud:create --managed (DOKS/GKE/EKS): Terraform apply, then Traefik via cloud:init:{provider}. No SSH/hardening/k3s install — those are VPS-only. */
const MANAGED_STEPS: Step[] = [
    { label: 'Provision', done: /Apply complete!/ },
    { label: 'Cluster ready', done: /Cluster ready\. Context:/ },
    {
        label: 'Traefik',
        done: /LoadBalancer IP:|Traefik is already installed/,
        failed: /Traefik installation failed\./,
    },
];

export default function RunSteps({
    output,
    status,
    kind = 'server',
}: {
    output: string;
    status: RunStatus;
    kind?: 'server' | 'dev-box' | 'managed';
}) {
    const STEPS =
        kind === 'dev-box'
            ? DEV_BOX_STEPS
            : kind === 'managed'
              ? MANAGED_STEPS
              : SERVER_STEPS;
    const doneCount =
        status === 'succeeded'
            ? STEPS.length
            : STEPS.findIndex((step) => !step.done.test(output));
    const reached = doneCount === -1 ? STEPS.length : doneCount;
    const currentState = {
        running: 'busy',
        failed: 'bad',
        cancelled: 'cancel',
        succeeded: 'done',
    }[status];

    return (
        <ol className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface px-4.5 py-3.5 ring-1 ring-line ring-inset">
            {STEPS.map((step, index) => {
                const hasFailed = step.failed?.test(output) ?? false;
                const state = hasFailed
                    ? 'bad'
                    : index < reached
                      ? 'done'
                      : index === reached
                        ? currentState
                        : 'todo';

                return (
                    <li key={step.label} className="flex items-center gap-2">
                        <span
                            className={cn(
                                'flex size-5.5 items-center justify-center rounded-full text-[11px] font-semibold',
                                state === 'done' && 'bg-ok text-white',
                                state === 'busy' && 'bg-busy-tint text-busy',
                                state === 'bad' && 'bg-accent text-white',
                                state === 'cancel' && 'bg-warn-tint text-warn',
                                state === 'todo' && 'bg-badge text-faint',
                            )}
                        >
                            {state === 'done'
                                ? '✓'
                                : state === 'bad'
                                  ? '!'
                                  : state === 'cancel'
                                    ? '■'
                                    : index + 1}
                        </span>
                        <span
                            className={cn(
                                'text-[13px] font-medium',
                                state === 'todo' ? 'text-faint' : 'text-ink',
                            )}
                        >
                            {step.label}
                        </span>
                        {index < STEPS.length - 1 && (
                            <span className="ml-1 h-px w-4.5 bg-line" />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
