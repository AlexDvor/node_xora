import { readFile, readdir, realpath, statfs } from 'node:fs/promises';

export async function readDisk(signal: AbortSignal) {
  const [stats, mounts] = await Promise.all([
    statfs('/', { bigint: true }),
    readFile('/proc/self/mountinfo', { encoding: 'utf8', signal }),
  ]);
  const mount = mounts.split('\n').find((line) => line.split(' ')[4] === '/');
  if (!mount) throw new Error('Missing root mount');
  const [left, right] = mount.split(' - ');
  const decode = (value: string) =>
    value.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
  const convert = (value: bigint) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('Unsafe filesystem size');
    return number;
  };
  return {
    mountPoint: '/',
    filesystem: right!.split(' ')[0]!,
    device: decode(right!.split(' ')[1]!),
    readOnly: left!.split(' ')[5]!.split(',').includes('ro'),
    totalBytes: convert(stats.blocks * stats.bsize),
    freeBytes: convert(stats.bfree * stats.bsize),
    availableBytes: convert(stats.bavail * stats.bsize),
  };
}

export interface TemperatureSensor {
  id: string;
  chip: string;
  label: string;
  celsius: number | null;
  reason: string | null;
}
export async function readTemperature(signal: AbortSignal): Promise<TemperatureSensor[]> {
  const sensors: TemperatureSensor[] = [];
  const entries = await readdir('/sys/class/hwmon');
  for (const entry of entries.slice(0, 64)) {
    signal.throwIfAborted();
    const directory = `/sys/class/hwmon/${entry}`;
    const [chip, device, files] = await Promise.all([
      readFile(`${directory}/name`, { encoding: 'utf8', signal }),
      realpath(directory),
      readdir(directory),
    ]);
    for (const file of files.filter((name) => /^temp\d+_input$/.test(name)).slice(0, 64)) {
      const base = file.replace('_input', '');
      const label = await readFile(`${directory}/${base}_label`, {
        encoding: 'utf8',
        signal,
      }).catch(() => base);
      try {
        const fault = await readFile(`${directory}/${base}_fault`, {
          encoding: 'utf8',
          signal,
        }).catch(() => '0');
        const text = await readFile(`${directory}/${file}`, { encoding: 'utf8', signal });
        const raw = Number(text.trim());
        if (!/^-?\d+$/.test(text.trim()) || !Number.isSafeInteger(raw) || fault.trim() !== '0')
          throw new Error('Sensor fault');
        sensors.push({
          id: `${device}/${base}`,
          chip: chip.trim(),
          label: label.trim(),
          celsius: raw / 1000,
          reason: null,
        });
      } catch {
        sensors.push({
          id: `${device}/${base}`,
          chip: chip.trim(),
          label: label.trim(),
          celsius: null,
          reason: 'SENSOR_UNAVAILABLE',
        });
      }
    }
  }
  return sensors;
}
