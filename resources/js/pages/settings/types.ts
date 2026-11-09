import type { WslState } from '@/components/setup/wsl-check';
import type { Editor } from '@/types/larakube';

export type AgentInfo = {
    name: string;
    installed: boolean;
    bridged: boolean;
};

export type ThemeMode = 'system' | 'light' | 'dark';

export type McpHttpSettings = {
    enabled: boolean;
    allowEdits: boolean;
    port: number;
    token: string | null;
};

export type SettingsData = {
    theme?: ThemeMode;
    localTld: string;
    email: string | null;
    defaultCloudProvider: string;
    shareToken: string | null;
    hideProjects?: boolean;
    experimental?: boolean;
    cliChannel?: string;
    demoMode?: boolean;
    demoHiddenServers?: string[];
    demoHiddenProjectGroups?: string[];
    demoHiddenProjects?: string[];
    defaultEditor?: string;
    detectedAgents: Record<string, AgentInfo>;
    mcpHttp?: McpHttpSettings;
};

export type SettingsProps = {
    settings: SettingsData;
    allowedTlds: string[];
    cloudProviders: Record<string, string>;
    availableEditors?: Editor[];
    allEditors?: Editor[];
    contexts?: string[];
    currentContext?: string | null;
    windows?: boolean;
    wsl?: WslState | null;
    serverNames?: string[] | null;
    projectGroupNames?: string[];
    projectPaths?: { path: string; label: string }[];
};

export type SettingsForm = {
    theme?: ThemeMode;
    localTld: string;
    email: string;
    defaultCloudProvider: string;
    shareToken: string;
    hideProjects: boolean;
    experimental: boolean;
    cliChannel: string;
    demoMode: boolean;
    demoHiddenServers: string[];
    demoHiddenProjectGroups: string[];
    demoHiddenProjects: string[];
    defaultEditor: string;
};

export type SettingsTab =
    | 'general'
    | 'ai-mcp'
    | 'advanced'
    | 'kubernetes'
    | 'updates-diagnostics'
    | 'danger-zone';
