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
                <div className="grid grid-cols-3 gap-2">
                    {/* GCE Checkbox */}
                    <label
                        className={cn(
                            'flex cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-center text-xs font-medium ring-1 transition select-none',
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
                        <Server className="size-3.5 shrink-0 text-soft" />
                        <span className="truncate">Compute Engine (GCE)</span>
                    </label>

                    {/* GKE Checkbox */}
                    <label
                        className={cn(
                            'flex cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-center text-xs font-medium ring-1 transition select-none',
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
                        <Layers className="size-3.5 shrink-0 text-soft" />
                        <span className="truncate">
                            Kubernetes Engine (GKE)
                        </span>
                    </label>

                    {/* Cloud DNS Checkbox */}
                    <label
                        className={cn(
                            'flex cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-center text-xs font-medium ring-1 transition select-none',
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
                        <Globe className="size-3.5 shrink-0 text-soft" />
                        <span className="truncate">Cloud DNS</span>
                    </label>
                </div>
            )}

            {/* Compact Predefined Roles */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-normal">
                <span className="text-foreground font-medium">
                    Grant IAM roles:
                </span>
                {activeRoles.map((r) => (
                    <code
                        key={r.id}
                        className="text-foreground rounded bg-badge px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-line"
                        title={r.name}
                    >
                        {r.id}
                    </code>
                ))}
            </div>

            {/* Specific scenarios */}
            {!compute && dns ? (
                <p className="text-[11px] leading-relaxed text-soft">
                    Grants hosted zone and record set management permissions for
                    external-dns and cert-manager — ideal when compute runs on
                    DigitalOcean, Hetzner, or bare metal while domains &amp; SSL
                    remain on Google Cloud DNS.
                </p>
            ) : compute && dns ? (
                <p className="text-[11px] leading-relaxed text-soft">
                    Combines GCE VM and firewall provisioning with automated
                    Cloud DNS record management. Ensure both Compute Engine and
                    Cloud DNS APIs are enabled in your project.
                </p>
            ) : gke ? (
                <p className="text-[11px] leading-relaxed text-soft">
                    Grants cluster and nodegroup lifecycle administration on
                    Google Kubernetes Engine. Ensure the Kubernetes Engine API
                    is enabled in your project.
                </p>
            ) : (
                <p className="text-[11px] leading-relaxed text-soft">
                    Grants virtual machine and firewall provisioning permissions
                    on Compute Engine. Ensure the Compute Engine API is enabled
                    in your project.
                </p>
            )}
        </div>
    );
}
