import { ShieldCheck } from 'lucide-react';
import CopyButton from '@/components/copy-button';

const EC2_STATEMENT = {
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
};

// Matches the role lifecycle and policy attachments LaraKube's own EKS
// Terraform (resources/views/tofu/aws/managed.blade.php) creates — two roles
// named "{cluster}-cluster-role"/"{cluster}-node-role", each with managed
// policies attached, never an inline policy or instance profile. The AWS
// provider still reads/clears inline policies and instance profiles on
// every read and delete of an aws_iam_role regardless of whether either is
// actually in use (same list AWS's own role-deletion runbook requires), so
// those actions are needed even though nothing is ever found to remove.
const EKS_STATEMENTS = [
    {
        Sid: 'LaraKubeEksClusterAndNodegroup',
        Effect: 'Allow',
        Action: [
            'eks:CreateCluster',
            'eks:DescribeCluster',
            'eks:DeleteCluster',
            'eks:ListClusters',
            'eks:TagResource',
            'eks:UntagResource',
            'eks:UpdateClusterConfig',
            'eks:UpdateClusterVersion',
            'eks:CreateNodegroup',
            'eks:DescribeNodegroup',
            'eks:DeleteNodegroup',
            'eks:ListNodegroups',
            'eks:UpdateNodegroupConfig',
            'eks:UpdateNodegroupVersion',
        ],
        Resource: '*',
    },
    {
        Sid: 'LaraKubeEksRoleLifecycle',
        Effect: 'Allow',
        Action: [
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:GetRole',
            'iam:TagRole',
            'iam:AttachRolePolicy',
            'iam:DetachRolePolicy',
            'iam:ListAttachedRolePolicies',
            'iam:ListRolePolicies',
            'iam:DeleteRolePolicy',
            'iam:ListInstanceProfilesForRole',
            'iam:RemoveRoleFromInstanceProfile',
        ],
        Resource: [
            'arn:aws:iam::*:role/*-cluster-role',
            'arn:aws:iam::*:role/*-node-role',
        ],
    },
    {
        // EKS assumes these roles on your behalf when it creates the cluster
        // and node group — PassRole is what actually lets that handoff happen.
        Sid: 'LaraKubeEksPassRole',
        Effect: 'Allow',
        Action: 'iam:PassRole',
        Resource: [
            'arn:aws:iam::*:role/*-cluster-role',
            'arn:aws:iam::*:role/*-node-role',
        ],
        Condition: {
            StringEquals: {
                'iam:PassedToService': [
                    'eks.amazonaws.com',
                    'ec2.amazonaws.com',
                ],
            },
        },
    },
    {
        // One-time per account: EKS creates its own service-linked roles the
        // first time a cluster or managed node group is created there.
        Sid: 'LaraKubeEksServiceLinkedRole',
        Effect: 'Allow',
        Action: 'iam:CreateServiceLinkedRole',
        Resource: 'arn:aws:iam::*:role/aws-service-role/*',
        Condition: {
            StringEquals: {
                'iam:AWSServiceName': [
                    'eks.amazonaws.com',
                    'eks-nodegroup.amazonaws.com',
                ],
            },
        },
    },
    {
        // Before EKS creates either service-linked role above, it first
        // checks whether one already exists — that check is a plain
        // iam:GetRole, which carries no iam:AWSServiceName context key, so
        // it can't be folded into the conditioned statement above (the
        // condition would never match and the call would still be denied).
        // Pinning the exact AWSServiceRoleForAmazonEKS(Nodegroup) ARNs still
        // got denied live (verified with the AWS CLI) even though the
        // documented aws-service-role/{principal}/{name} path looks right,
        // so this covers the whole service-linked-role path instead — still
        // a read-only action, still well short of Resource: '*'.
        Sid: 'LaraKubeEksServiceLinkedRoleCheck',
        Effect: 'Allow',
        Action: 'iam:GetRole',
        Resource: 'arn:aws:iam::*:role/aws-service-role/*',
    },
];

const ROUTE53_STATEMENT = {
    Sid: 'LaraKubeRoute53LeastPrivilege',
    Effect: 'Allow',
    Action: [
        'route53:ListHostedZones',
        'route53:ListResourceRecordSets',
        'route53:ChangeResourceRecordSets',
        'route53:GetChange',
    ],
    Resource: [
        'arn:aws:route53:::hostedzone/*',
        'arn:aws:route53:::change/*',
        '*',
    ],
};

export const getMinimalAwsIamPolicy = (
    includeEks = false,
    includeRoute53 = false,
) => {
    const statements: any[] = [EC2_STATEMENT];
    if (includeEks) {
        statements.push(...EKS_STATEMENTS);
    }
    if (includeRoute53) {
        statements.push(ROUTE53_STATEMENT);
    }

    return JSON.stringify(
        { Version: '2012-10-17', Statement: statements },
        null,
        2,
    );
};

export const MINIMAL_AWS_IAM_POLICY = getMinimalAwsIamPolicy(false, false);

export const MINIMAL_AWS_IAM_POLICY_WITH_EKS = getMinimalAwsIamPolicy(
    true,
    false,
);

export default function AwsPolicyHelper({
    className,
    includeEks = false,
    includeRoute53 = false,
}: {
    className?: string;
    /** Managed Kubernetes (EKS) is selected — the policy needs IAM role + EKS actions on top of EC2, not EC2 alone. */
    includeEks?: boolean;
    /** Route 53 DNS automation is selected — the policy needs Route 53 actions. */
    includeRoute53?: boolean;
}) {
    const badgeLabel = () => {
        const parts = [includeEks ? 'EC2 + EKS' : 'EC2 Only'];
        if (includeRoute53) {
            parts.push('Route 53');
        }

        return parts.join(' + ');
    };

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
                        {badgeLabel()}
                    </span>
                </div>
                <CopyButton
                    value={getMinimalAwsIamPolicy(includeEks, includeRoute53)}
                    label="Copy Minimal Policy JSON"
                    variant="secondary"
                    size="sm"
                />
            </div>
            {includeEks ? (
                <>
                    <p className="leading-relaxed">
                        <strong className="text-foreground">
                            No one-click shortcut here:
                        </strong>{' '}
                        AWS's EKS-named managed policies (like{' '}
                        <code className="text-foreground rounded bg-badge px-1 py-0.5 font-mono text-[11px]">
                            AmazonEKSClusterPolicy
                        </code>
                        ) are for the cluster's own internal role once it's
                        running — not for the account creating it. There's no
                        AWS-managed policy for that; copy the JSON above and
                        create a custom policy with it.
                    </p>
                    <p className="text-[11px] leading-relaxed text-soft">
                        In a hurry on a disposable/workshop account and not
                        worried about least privilege? Attaching{' '}
                        <code className="text-foreground rounded bg-badge px-1 py-0.5 font-mono text-[11px]">
                            AdministratorAccess
                        </code>{' '}
                        works too — just never do that on an account you
                        actually care about securing.
                    </p>
                </>
            ) : (
                <>
                    <p className="leading-relaxed">
                        <strong className="text-foreground">
                            Quick Setup:
                        </strong>{' '}
                        Under{' '}
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
                        For strict least privilege, copy our minimal policy JSON
                        above and create a custom IAM policy in AWS with only
                        the required EC2 instance, security group, and volume
                        actions.
                    </p>
                </>
            )}
        </div>
    );
}
