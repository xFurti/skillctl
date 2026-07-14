import type { AgentAdapter, CatalogProvider, RegistrySource } from '@skillctl/core';

export interface PluginCommand {
  name(): string;
  description(str: string): PluginCommand;
  action(fn: (...args: unknown[]) => void | Promise<void>): PluginCommand;
}

export interface PluginProgram {
  addCommand(cmd: PluginCommand): void;
}

export interface PluginAPI {
  readonly apiVersion: 1;
  registerCommand(cmd: PluginCommand): void;
  registerAdapter(adapter: AgentAdapter): void;
  registerRegistrySource(source: RegistrySource): void;
  registerCatalogProvider(provider: CatalogProvider): void;
  registerAuditRule(rule: PluginAuditRule): void;
}

export interface PluginAuditRule {
  id: string;
  run(skillName: string, skillPath: string): Promise<Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    path?: string;
    description?: string;
    helpUri?: string;
    location?: { path: string; startLine?: number; endLine?: number };
    fingerprint?: string;
  }>>;
}

export interface SkillctlPlugin {
  name: string;
  version?: string;
  register(api: PluginAPI): void | Promise<void>;
}

export interface PluginManifestEntry {
  specifier: string;
  enabled: boolean;
  allowLocal?: boolean;
}

export interface PluginLockEntry {
  name: string;
  specifier: string;
  resolved: string;
  integrity: string;
  path: string;
  entrypoint: string;
  apiVersion: number;
  capabilities: string[];
  tarballUrl?: string;
  tarballIntegrity?: string;
  fetchedAt: string;
}

export interface PluginInspection {
  name: string;
  requested: string;
  resolvedVersion: string;
  publisher?: { name: string; email?: string };
  tarballUrl?: string;
  tarballIntegrity?: string;
  entrypoint: string;
  apiVersion: number;
  capabilities: string[];
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
  trusted: boolean;
  trustReason: string;
  warnings: string[];
}
