import type { Command } from 'commander';
import { findSkillctlProject } from '@skillctl/core';
import { loadLockfile } from '@skillctl/lockfile';
import { loadPluginManifest } from '@skillctl/plugin-system';
import { SkillctlError, handleCommandError } from '../lib/errors.js';
import { cliLog, writeCliRaw } from '../lib/output.js';

const commands = ['init', 'add', 'install', 'list', 'search', 'info', 'outdated', 'update', 'sync', 'remove', 'doctor', 'import', 'audit', 'plugin', 'skill', 'completion'];
const agents = ['claude-code', 'cursor', 'opencode', 'codex', 'gemini-cli', 'grok', 'pi'];

export function registerCompletion(program: Command): void {
  program
    .command('completion <shell>')
    .description('Print completion setup for bash, zsh, or PowerShell')
    .option('--json', 'machine-readable envelope output')
    .action((shell, options) => {
      try {
        const normalized = String(shell).toLowerCase();
        const selected = normalized === 'pwsh' ? 'powershell' : normalized;
        const script = selected === 'bash' ? bashCompletion()
          : selected === 'zsh' ? zshCompletion()
          : selected === 'powershell' ? powerShellCompletion()
          : null;
        if (!script) throw new SkillctlError('Supported shells: bash, zsh, powershell', 'INVALID_SHELL', 2);
        if (options.json) cliLog(JSON.stringify({ shell: selected, script }));
        else writeCliRaw('stdout', script);
      } catch (err) { handleCommandError(err, 'completion'); }
    });

  program
    .command('completion-candidates <kind>', { hidden: true })
    .action(async (kind) => {
      if (kind === 'agents') writeCliRaw('stdout', `${agents.join('\n')}\n`);
      else if (kind === 'plugins') {
        const manifest = await loadPluginManifest();
        writeCliRaw('stdout', `${Object.keys(manifest.plugins).sort().join('\n')}\n`);
      } else if (kind === 'skills') {
        const root = await findSkillctlProject();
        const lock = root ? await loadLockfile(root) : null;
        writeCliRaw('stdout', `${Object.keys(lock?.skills || {}).sort().join('\n')}\n`);
      } else throw new SkillctlError('Candidate kind must be skills, plugins, or agents', 'INVALID_COMPLETION_KIND', 2);
    });
}

export function bashCompletion(): string {
  return `_skillctl() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [[ "$prev" == "--agent" ]]; then
    COMPREPLY=( $(compgen -W "${agents.join(' ')}" -- "$cur") ); return
  fi
  if [[ "\${COMP_WORDS[1]}" =~ ^(info|update|remove)$ ]]; then
    COMPREPLY=( $(compgen -W "$(skillctl completion-candidates skills 2>/dev/null)" -- "$cur") ); return
  fi
  if [[ "\${COMP_WORDS[1]}" == "plugin" && "\${COMP_WORDS[2]}" =~ ^(info|update|remove|enable|disable)$ ]]; then
    COMPREPLY=( $(compgen -W "$(skillctl completion-candidates plugins 2>/dev/null)" -- "$cur") ); return
  fi
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${commands.join(' ')}" -- "$cur") ); return
  fi
  COMPREPLY=( $(compgen -W "--help --json --global --project --dry-run --yes" -- "$cur") )
}
complete -F _skillctl skillctl
`;
}

export function zshCompletion(): string {
  return `#compdef skillctl
_skillctl() {
  local -a commands agents
  commands=(${commands.map((command) => `'${command}:${command}'`).join(' ')})
  agents=(${agents.map((agent) => `'${agent}'`).join(' ')})
  if (( CURRENT == 2 )); then _describe 'command' commands; return; fi
  if [[ $words[CURRENT-1] == '--agent' ]]; then _describe 'agent' agents; return; fi
  if [[ $words[2] == (info|update|remove) ]]; then
    local -a skills; skills=(\${(f)"$(skillctl completion-candidates skills 2>/dev/null)"}); _describe 'skill' skills; return
  fi
  if [[ $words[2] == plugin && $words[3] == (info|update|remove|enable|disable) ]]; then
    local -a plugins; plugins=(\${(f)"$(skillctl completion-candidates plugins 2>/dev/null)"}); _describe 'plugin' plugins; return
  fi
  _arguments '*:argument:_files'
}
_skillctl "$@"
`;
}

export function powerShellCompletion(): string {
  return `Register-ArgumentCompleter -Native -CommandName skillctl -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = '${commands.join("','")}'
  $agents = '${agents.join("','")}'
  $tokens = @($commandAst.CommandElements | ForEach-Object { $_.Extent.Text })
  $candidates = if ($tokens.Count -gt 1 -and $tokens[-2] -eq '--agent') { $agents } elseif ($tokens.Count -le 2) { $commands } elseif ($tokens[1] -in 'info','update','remove') { @(skillctl completion-candidates skills 2>$null) } elseif ($tokens.Count -gt 2 -and $tokens[1] -eq 'plugin' -and $tokens[2] -in 'info','update','remove','enable','disable') { @(skillctl completion-candidates plugins 2>$null) } else { '--help','--json','--global','--project','--dry-run','--yes' }
  $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
`;
}
