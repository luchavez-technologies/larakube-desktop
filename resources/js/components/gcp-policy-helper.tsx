import { useEffect, useState } from 'react';
import { Globe, Layers, Server, ShieldCheck } from 'lucide-react';
import CopyButton from '@/components/copy-button';
import { cn } from '@/lib/utils';

export type GcpPolicyOptions = {
    includeCompute?: boolean;
    includeGke?: boolean;
    includeDns?: boolean;
};

export const getGcpRoles = (options: GcpPolicyOptions) => {
    const roles: { id: string; name: string; service: string }[] = [];

    if (options.includeCompute) {
        roles.push(
            {
                id: 'roles/compute.instanceAdmin.v1',
                name: 'Compute Instance Admin (v1)',
                service: 'Compute Engine',
            },
            {
                id: 'roles/iam.serviceAccountUser',
                name: 'Service Account User',
                service: 'Compute Engine',
            },
        );
    }

    if (options.includeGke) {
        roles.push({
            id: 'roles/container.admin',
            name: 'Kubernetes Engine Admin',
            service: 'GKE',
        });
        if (!options.includeCompute) {
            roles.push({
                id: 'roles/iam.serviceAccountUser',
                name: 'Service Account User',
                service: 'GKE',
            });
        }
    }

    if (options.includeDns) {
        roles.push({
            id: 'roles/dns.admin',
            name: 'DNS Administrator',
            service: 'Cloud DNS',
        });
    }

    return roles;
};

export const getGcloudBindingCommand = (
    options: GcpPolicyOptions,
    projectId = 'PROJECT_ID',
    saEmail = 'SA_EMAIL@PROJECT_ID.iam.gserviceaccount.com',
) => {
    const roles = getGcpRoles(options);
    const targetProject = projectId || 'PROJECT_ID';
    const targetSa = saEmail || 'SA_EMAIL@PROJECT_ID.iam.gserviceaccount.com';

    const commands = roles.map(
        (r) =>
            `gcloud projects add-iam-policy-binding ${targetProject} \\\n  --member="serviceAccount:${targetSa}" \\\n  --role="${r.id}"`,
    );

    return commands.join('\n\n');
};

export interface GcpPolicyHelperProps {
    className?: string;
    /** Whether Compute Engine actions are included (default: true) */
    includeCompute?: boolean;
    /** Managed Kubernetes (GKE) is selected (default: false) */
    includeGke?: boolean;
    /** Cloud DNS automation is selected (default: false) */
    includeDns?: boolean;
    /** Allow the operator to interactively toggle services (default: true) */
    interactive?: boolean;
    /** Optional detected GCP project ID to interpolate into copy commands */
    projectId?: string;
    /** Optional detected GCP Service Account email to interpolate into copy commands */
    clientEmail?: string;
}

export default function GcpPolicyHelper({
    className,
    includeCompute = true,
    includeGke = false,
    includeDns = false,
    interactive = true,
    projectId,
    clientEmail,
}: GcpPolicyHelperProps) {
    const [compute, setCompute] = useState(includeCompute);
    const [gke, setGke] = useState(includeGke);
    const [dns, setDns] = useState(includeDns);

    useEffect(() => {
        setCompute(includeCompute);
        setGke(includeGke);
        setDns(includeDns);
    }, [includeCompute, includeGke, includeDns]);

    const toggleCompute = () => {
        if (compute && !gke && !dns) return; // Prevent deselecting everything
        if (compute && gke) {
            setGke(false);
        }
        setCompute(!compute);
    };

    const toggleGke = () => {
        if (gke && !compute && !dns) return; // Prevent deselecting everything
        const next = !gke;
        setGke(next);
        if (next && !compute) {
            setCompute(true); // GKE node pools depend on GCE compute
        }
    };

    const toggleDns = () => {
        if (dns && !compute && !gke) return; // Prevent deselecting everything
        setDns(!dns);
    };

    const badgeLabel = () => {
        const parts: string[] = [];
        if (compute && !gke) parts.push('GCE');
        if (gke) parts.push(compute ? 'GCE + GKE' : 'GKE');
        if (dns) parts.push('Cloud DNS');

        if (parts.length === 0) return 'Custom';
        if (parts.length === 1) return `${parts[0]} Only`;
        return parts.join(' + ');
    };

    const activeRoles = getGcpRoles({
        includeCompute: compute,
        includeGke: gke,
        includeDns: dns,
    });

    const bindingCommands = getGcloudBindingCommand(
        { includeCompute: compute, includeGke: gke, includeDns: dns },
        projectId,
        clientEmail,
    );

    return (
        <div
            className={`space-y-3 rounded-xl border border-line bg-paper/60 p-3.5 text-xs text-soft ${
                className ?? ''
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="size-4 text-emerald-500" />
                    <span>Google Cloud IAM Permissions</span>
                    <span className="rounded-full bg-badge px-2 py-0.5 text-[10px] text-soft">
                        {badgeLabel()}
                    </span>
                </div>
                <CopyButton
                    value={bindingCommands}
                    label="Copy gcloud Commands"
                    variant="secondary"
                    size="sm"
                />
            </div>

            {interactive && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface/60 p-2 ring-1 ring-line/50">
                    <span className="text-foreground mr-0.5 text-[11px] font-medium">
                        Target Services:
                    </span>

                    {/* GCE Checkbox */}
                    <label
                        className={cn(
                            'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 transition select-none',
                            compute
                                ? 'text-foreground bg-surface shadow-xs ring-servers dark:bg-badge'
                                : 'hover:text-foreground bg-surface/30 text-soft ring-line hover:bg-surface',
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={compute}
                            onChange={toggleCompute}
                            className="size-3.5 rounded border-line text-servers focus:ring-servers"
                        />
                        <Server className="size-3.5 text-soft" />
                        <span>Compute Engine (GCE)</span>
                    </label>

                    {/* GKE Checkbox */}
                    <label
                        className={cn(
                            'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 transition select-none',
                            gke
                                ? 'text-foreground bg-surface shadow-xs ring-servers dark:bg-badge'
                                : 'hover:text-foreground bg-surface/30 text-soft ring-line hover:bg-surface',
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={gke}
                            onChange={toggleGke}
                            className="size-3.5 rounded border-line text-servers focus:ring-servers"
                        />
                        <Layers className="size-3.5 text-soft" />
                        <span>Kubernetes Engine (GKE)</span>
                    </label>

                    {/* Cloud DNS Checkbox */}
                    <label
                        className={cn(
                            'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 transition select-none',
                            dns
                                ? 'text-foreground bg-surface shadow-xs ring-servers dark:bg-badge'
                                : 'hover:text-foreground bg-surface/30 text-soft ring-line hover:bg-surface',
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={dns}
                            onChange={toggleDns}
                            className="size-3.5 rounded border-line text-servers focus:ring-servers"
                        />
                        <Globe className="size-3.5 text-soft" />
                        <span>Cloud DNS</span>
                    </label>
                </div>
            )}

            {/* Quick Setup and Predefined Roles */}
            <div>
                <p className="leading-relaxed">
                    <strong className="text-foreground">
                        Recommended IAM Roles:
                    </strong>{' '}
                    In Google Cloud Console under{' '}
                    <em className="text-foreground font-medium not-italic">
                        IAM &amp; Admin &gt; Service Accounts
                    </em>
                    , grant your Service Account:
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {activeRoles.map((r) => (
                        <span
                            key={r.id}
                            className="text-foreground inline-flex items-center gap-1 rounded bg-badge px-2 py-0.5 font-mono text-[11px] ring-1 ring-line"
                        >
                            <span className="font-sans font-semibold text-soft">
                                {r.name}:
                            </span>
                            <span>{r.id}</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Specific scenarios */}
            {!compute && dns ? (
                <p className="text-[11px] leading-relaxed text-soft">
                    For strict least privilege,{' '}
                    <code className="text-foreground font-mono">
                        roles/dns.admin
                    </code>{' '}
                    grants only hosted zone and record set management
                    permissions — ideal when compute workloads run on
                    DigitalOcean, Hetzner, or on-prem while domains &amp; SSL
                    certificates remain on Google Cloud DNS. Ensure the{' '}
                    <strong>Cloud DNS API</strong> is enabled in your GCP
                    project.
                </p>
            ) : compute && dns ? (
                <p className="text-[11px] leading-relaxed text-soft">
                    Combines GCE virtual machine and firewall provisioning with
                    automated Cloud DNS record handling. Ensure both the{' '}
                    <strong>Compute Engine API</strong> and{' '}
                    <strong>Cloud DNS API</strong> are enabled in your GCP
                    project.
                </p>
            ) : gke ? (
                <p className="text-[11px] leading-relaxed text-soft">
                    Grants cluster and nodegroup lifecycle administration on
                    Google Kubernetes Engine. Ensure the{' '}
                    <strong>Kubernetes Engine API</strong> is enabled in your
                    GCP project.
                </p>
            ) : (
                <p className="text-[11px] leading-relaxed text-soft">
                    Grants instance, disk, and firewall rule lifecycle
                    management on Compute Engine without broad project owner
                    rights. Ensure the <strong>Compute Engine API</strong> is
                    enabled in your GCP project.
                </p>
            )}
        </div>
    );
}
