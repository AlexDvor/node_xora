export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const provider = env.SYSTEM_PROVIDER ?? 'linux';
  if (provider !== 'linux' && provider !== 'mock') throw new Error('Invalid SYSTEM_PROVIDER');
  // Nginx exposes LAN access; the API itself stays on loopback.
  return { port, provider, host: '127.0.0.1' } as const;
}
