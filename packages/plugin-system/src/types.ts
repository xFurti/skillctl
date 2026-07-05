import type { AgentAdapter, RegistrySource } from '@skillctl/core';

export interface PluginCommand {
  name(): string;
  description(str: string): PluginCommand;
  action(fn: (...args: unknown[]) => void | Promise<void>): PluginCommand;
}

export interface PluginProgram {
  addCommand(cmd: PluginCommand): void;
}

export interface PluginAPI {
  registerCommand(cmd: PluginCommand): void;
  registerAdapter(adapter: AgentAdapter): void;
  registerRegistrySource(source: RegistrySource): void;
}

export interface SkillctlPlugin {
  name: string;
  version?: string;
  register(api: PluginAPI): void | Promise<void>;
}