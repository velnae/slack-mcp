import packageJson from '../package.json' with { type: 'json' };

interface PackageMeta {
  name?: string;
  version?: string;
}

const typedPackageJson = packageJson as PackageMeta;

export const PACKAGE_NAME = typedPackageJson.name ?? '@velnae/slack-mcp';
export const PACKAGE_VERSION = typedPackageJson.version ?? '0.1.2';
export const MCP_SERVER_NAME = 'slack-mcp';
