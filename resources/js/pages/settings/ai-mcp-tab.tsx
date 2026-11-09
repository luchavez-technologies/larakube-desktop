import { Form, router } from '@inertiajs/react';
import { useState } from 'react';
import {
    AlertTriangle,
    Eye,
    EyeOff,
    RotateCw,
    Save,
    Terminal,
} from 'lucide-react';
import Button from '@/components/button';
import Card from '@/components/card';
import CopyButton from '@/components/copy-button';
import StatusPill from '@/components/status-pill';
import type { AgentInfo, McpHttpSettings } from './types';

type AiMcpTabProps = {
    mcpHttp?: McpHttpSettings;
    detectedAgents: Record<string, AgentInfo>;
};

export default function AiMcpTab({ mcpHttp, detectedAgents }: AiMcpTabProps) {
    const isEnabled = mcpHttp?.enabled ?? false;
    const allowEdits = mcpHttp?.allowEdits ?? false;
    const port = mcpHttp?.port ?? 47821;
    const token = mcpHttp?.token ?? '';

    const [portInput, setPortInput] = useState<number>(port);
    const [portDirty, setPortDirty] = useState<boolean>(false);
    const [showToken, setShowToken] = useState<boolean>(false);
    const [confirmingRegen, setConfirmingRegen] = useState<boolean>(false);
    const [updating, setUpdating] = useState<boolean>(false);

    function toggleEnabled(nextEnabled: boolean) {
        setUpdating(true);
        router.post(
            '/settings/mcp-http',
            { enabled: nextEnabled },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setUpdating(false),
            },
        );
    }

    function toggleAllowEdits(nextAllow: boolean) {
        setUpdating(true);
        router.post(
            '/settings/mcp-http',
            { allowEdits: nextAllow },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setUpdating(false),
            },
        );
    }

    function savePort() {
        setUpdating(true);
        router.post(
            '/settings/mcp-http',
            { port: portInput },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setUpdating(false);
                    setPortDirty(false);
                },
            },
        );
    }

    function regenerateToken() {
        setUpdating(true);
        router.post(
            '/settings/mcp-http/regenerate-token',
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setUpdating(false);
                    setConfirmingRegen(false);
                },
            },
        );
    }

    const maskedToken = '•'.repeat(token.length > 0 ? token.length : 32);
    const displayToken = showToken ? token : maskedToken;

    const claudeSnippet = `claude mcp add --transport http larakube-desktop http://127.0.0.1:${port}/mcp --header "Authorization: Bearer ${token}"`;
    const claudeSnippetDisplay = `claude mcp add --transport http larakube-desktop http://127.0.0.1:${port}/mcp --header "Authorization: Bearer ${displayToken}"`;

    const openCodeSnippet = JSON.stringify(
        {
            mcpServers: {
                'larakube-desktop': {
                    url: `http://127.0.0.1:${port}/mcp`,
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            },
        },
        null,
        2,
    );
    const openCodeSnippetDisplay = JSON.stringify(
        {
            mcpServers: {
                'larakube-desktop': {
                    url: `http://127.0.0.1:${port}/mcp`,
                    headers: {
                        Authorization: `Bearer ${displayToken}`,
                    },
                },
            },
        },
        null,
        2,
    );

    const curlSnippet = `curl -s -X POST http://127.0.0.1:${port}/mcp \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
    const curlSnippetDisplay = `curl -s -X POST http://127.0.0.1:${port}/mcp \\
  -H "Authorization: Bearer ${displayToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

    return (
        <div className="space-y-5">
            {/* HTTP MCP Server Card */}
            <Card
                label="Local MCP Server (HTTP)"
                action={
                    <StatusPill tone={isEnabled ? 'ok' : 'muted'}>
                        {isEnabled ? 'Active' : 'Inactive'}
                    </StatusPill>
                }
            >
                <div className="space-y-4">
                    <p className="text-xs leading-relaxed text-soft">
                        Runs a persistent local HTTP listener with Bearer token
                        authentication. AI assistants (such as Claude Code,
                        Antigravity CLI, OpenCode, and Codex) can connect via a
                        single copy-paste command without needing local PHP or
                        subprocess permissions.
                    </p>

                    {/* Enable Toggle */}
                    <div className="space-y-3 rounded-xl border border-line bg-paper p-3.5">
                        <label className="flex cursor-pointer items-start justify-between gap-3">
                            <div className="space-y-0.5">
                                <span className="block text-xs font-semibold text-ink">
                                    Enable MCP HTTP Server
                                </span>
                                <span className="block text-[11px] leading-relaxed text-soft">
                                    Binds to{' '}
                                    <code className="font-mono text-ink">
                                        127.0.0.1:{port}
                                    </code>{' '}
                                    and services incoming JSON-RPC calls.
                                </span>
                            </div>
                            <input
                                type="checkbox"
                                checked={isEnabled}
                                disabled={updating}
                                onChange={(e) =>
                                    toggleEnabled(e.target.checked)
                                }
                                className="mt-1 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                            />
                        </label>

                        {/* Allow Edits Toggle */}
                        <div className="border-t border-line/60 pt-3">
                            <label className="flex cursor-pointer items-start justify-between gap-3">
                                <div className="space-y-0.5">
                                    <span className="block text-xs font-semibold text-ink">
                                        Allow MCP clients to edit
                                    </span>
                                    <span className="block text-[11px] leading-relaxed text-soft">
                                        Permits AI clients to run write actions
                                        (bring projects up/down, heal
                                        infrastructure, install/remove cluster
                                        tools). Read tools always work.
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={allowEdits}
                                    disabled={!isEnabled || updating}
                                    onChange={(e) =>
                                        toggleAllowEdits(e.target.checked)
                                    }
                                    className="mt-1 size-4 rounded border-line text-brand accent-brand focus:ring-brand"
                                />
                            </label>
                        </div>
                    </div>

                    {isEnabled && (
                        <div className="space-y-4 pt-1">
                            {/* Port Configuration */}
                            <div className="space-y-2 rounded-xl border border-line bg-surface p-3.5">
                                <label className="block text-xs font-medium text-ink">
                                    Server Port
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={1024}
                                        max={65535}
                                        value={portInput}
                                        onChange={(e) => {
                                            setPortInput(
                                                Number(e.target.value),
                                            );
                                            setPortDirty(true);
                                        }}
                                        className="w-32 rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-xs text-ink outline-none focus:ring-2 focus:ring-brand"
                                    />
                                    {portDirty && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            disabled={updating}
                                            onClick={savePort}
                                            className="h-8 gap-1.5"
                                        >
                                            <Save className="size-3.5" />
                                            <span>Save Port</span>
                                        </Button>
                                    )}
                                </div>
                                <p className="text-[11px] text-soft">
                                    Default port is 47821. Restarting the server
                                    will apply any changes immediately.
                                </p>
                            </div>

                            {/* Access Token */}
                            <div className="space-y-2.5 rounded-xl border border-line bg-surface p-3.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-ink">
                                        Bearer Access Token
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowToken(!showToken)}
                                        className="flex items-center gap-1 text-[11px] font-medium text-soft transition-colors hover:text-ink"
                                    >
                                        {showToken ? (
                                            <>
                                                <EyeOff className="size-3" />
                                                <span>Hide</span>
                                            </>
                                        ) : (
                                            <>
                                                <Eye className="size-3" />
                                                <span>Reveal</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        readOnly
                                        value={token}
                                        className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-xs text-ink outline-none"
                                    />
                                    <CopyButton value={token} />
                                </div>

                                {confirmingRegen ? (
                                    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                                        <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                                            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                            <span>
                                                Regenerating will disconnect all
                                                existing MCP clients. You will
                                                need to reconfigure them with
                                                the new token.
                                            </span>
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="danger"
                                                disabled={updating}
                                                onClick={regenerateToken}
                                                className="h-7 gap-1"
                                            >
                                                <RotateCw className="size-3" />
                                                <span>Confirm Regenerate</span>
                                            </Button>
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="secondary"
                                                onClick={() =>
                                                    setConfirmingRegen(false)
                                                }
                                                className="h-7"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="ghost"
                                            onClick={() =>
                                                setConfirmingRegen(true)
                                            }
                                            className="gap-1 px-1.5 text-[11px] text-soft hover:text-ink"
                                        >
                                            <RotateCw className="size-3" />
                                            <span>Regenerate token…</span>
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Client Setup Snippets */}
                            <div className="space-y-3 pt-2">
                                <p className="text-xs font-semibold text-ink">
                                    Client Setup Snippets
                                </p>

                                {/* Claude Code snippet */}
                                <div className="space-y-1.5 rounded-xl border border-line bg-paper p-3">
                                    <div className="flex items-center justify-between text-xs font-medium text-ink">
                                        <span className="flex items-center gap-1.5">
                                            <Terminal className="size-3.5 text-soft" />
                                            Claude Code / CLI
                                        </span>
                                        <CopyButton value={claudeSnippet} />
                                    </div>
                                    <pre className="overflow-x-auto rounded-lg bg-term p-2.5 font-mono text-[11px] whitespace-pre-wrap text-term-bright">
                                        {claudeSnippetDisplay}
                                    </pre>
                                </div>

                                {/* OpenCode / Cursor snippet */}
                                <div className="space-y-1.5 rounded-xl border border-line bg-paper p-3">
                                    <div className="flex items-center justify-between text-xs font-medium text-ink">
                                        <span>
                                            OpenCode / Cursor / Codex
                                            Configuration
                                        </span>
                                        <CopyButton value={openCodeSnippet} />
                                    </div>
                                    <pre className="overflow-x-auto rounded-lg bg-term p-2.5 font-mono text-[11px] whitespace-pre-wrap text-term-bright">
                                        {openCodeSnippetDisplay}
                                    </pre>
                                </div>

                                {/* Curl snippet */}
                                <div className="space-y-1.5 rounded-xl border border-line bg-paper p-3">
                                    <div className="flex items-center justify-between text-xs font-medium text-ink">
                                        <span>Test with cURL</span>
                                        <CopyButton value={curlSnippet} />
                                    </div>
                                    <pre className="overflow-x-auto rounded-lg bg-term p-2.5 font-mono text-[11px] whitespace-pre-wrap text-term-bright">
                                        {curlSnippetDisplay}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* AI Agent Bridge Card (stdio) */}
            <Card label="AI Agent Bridge (stdio)">
                <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-soft">
                        Direct process bridging writes local configuration files
                        for supported desktop AI tools to spawn LaraKube's
                        desktop server via stdio:
                    </p>
                    <div className="space-y-1.5 rounded-lg border border-line bg-paper p-2.5 text-[11px]">
                        <p className="font-semibold text-ink">
                            🖥 larakube-desktop
                        </p>
                        <p className="text-soft">
                            Lists your Projects, Servers, and Cluster Tools, and
                            can bring projects up/down, heal them, and
                            install/remove tools.
                        </p>
                    </div>

                    <div className="border-t border-line pt-3">
                        <p className="mb-2 text-xs font-medium text-ink">
                            Detected AI Agents
                        </p>
                        <div className="space-y-2">
                            {Object.entries(detectedAgents).map(
                                ([slug, agent]) => (
                                    <div
                                        key={slug}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-xs"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-ink">
                                                {agent.name}
                                            </p>
                                            <p className="text-[10px] text-soft">
                                                {agent.bridged
                                                    ? 'MCP Configured'
                                                    : agent.installed
                                                      ? 'Installed'
                                                      : 'Not detected'}
                                            </p>
                                        </div>
                                        <Form
                                            method="post"
                                            action={`/settings/bridge/${slug}`}
                                        >
                                            {({ processing }) => (
                                                <Button
                                                    type="submit"
                                                    variant="secondary"
                                                    size="sm"
                                                    disabled={processing}
                                                >
                                                    {agent.bridged
                                                        ? 'Re-link'
                                                        : 'Connect'}
                                                </Button>
                                            )}
                                        </Form>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
