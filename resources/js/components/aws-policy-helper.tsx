import { ShieldCheck } from 'lucide-react';
import CopyButton from '@/components/copy-button';

export const MINIMAL_AWS_IAM_POLICY = JSON.stringify(
    {
        Version: '2012-10-17',
        Statement: [
            {
                Sid: 'LaraKubeEC2LeastPrivilege',
                Effect: 'Allow',
                Action: [
                    'ec2:Describe*',
                    'ec2:ImportKeyPair',
                    'ec2:DeleteKeyPair',
                    'ec2:CreateSecurityGroup',
                    'ec2:DeleteSecurityGroup',
                    'ec2:AuthorizeSecurityGroupIngress',
                    'ec2:AuthorizeSecurityGroupEgress',
                    'ec2:RevokeSecurityGroupIngress',
                    'ec2:RevokeSecurityGroupEgress',
                    'ec2:RunInstances',
                    'ec2:StartInstances',
                    'ec2:StopInstances',
                    'ec2:TerminateInstances',
                    'ec2:ModifyInstanceAttribute',
                    'ec2:CreateVolume',
                    'ec2:AttachVolume',
                    'ec2:DetachVolume',
                    'ec2:DeleteVolume',
                    'ec2:ModifyVolume',
                    'ec2:ModifyVolumeAttribute',
                    'ec2:CreateNetworkInterface',
                    'ec2:AttachNetworkInterface',
                    'ec2:DeleteNetworkInterface',
                    'ec2:ModifyNetworkInterfaceAttribute',
                    'ec2:CreateTags',
                    'ec2:DeleteTags',
                ],
                Resource: '*',
            },
        ],
    },
    null,
    2,
);

export default function AwsPolicyHelper({ className }: { className?: string }) {
    return (
        <div
            className={`space-y-2.5 rounded-xl border border-line bg-paper/60 p-3.5 text-xs text-soft ${
                className ?? ''
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="text-foreground flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="size-4 text-emerald-500" />
                    <span>AWS IAM Permissions</span>
                    <span className="rounded-full bg-badge px-2 py-0.5 text-[10px] text-soft">
                        EC2 Only
                    </span>
                </div>
                <CopyButton
                    value={MINIMAL_AWS_IAM_POLICY}
                    label="Copy Minimal Policy JSON"
                    variant="secondary"
                    size="sm"
                />
            </div>
            <p className="leading-relaxed">
                <strong className="text-foreground">Quick Setup:</strong> Under{' '}
                <em className="text-foreground font-medium not-italic">
                    Attach policies directly
                </em>
                , search and attach{' '}
                <code className="text-foreground rounded bg-badge px-1 py-0.5 font-mono text-[11px]">
                    AmazonEC2FullAccess
                </code>
                .
            </p>
            <p className="text-[11px] leading-relaxed text-soft">
                For strict least privilege, copy our minimal policy JSON above
                and create a custom IAM policy in AWS with only the required EC2
                instance, security group, and volume actions.
            </p>
        </div>
    );
}
