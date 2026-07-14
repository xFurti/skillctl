export const releasePackages = [
  'core',
  'manifest',
  'lockfile',
  'link-manager',
  'plugin-system',
  'project-state',
  'adapters',
  'security',
  'registry',
  'import',
  'testing',
  'cli',
];

export function archiveName(packageName, version) {
  return `skillctl-${packageName}-${version}.tgz`;
}
