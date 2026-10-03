export interface QualityOption { label: string; height: number; url: string }

export async function loadHLSQualities(masterURL: string): Promise<QualityOption[]> {
  if (!masterURL || masterURL.startsWith('file:')) return [];
  const response = await fetch(masterURL);
  if (!response.ok) return [];
  const lines = (await response.text()).split(/\r?\n/);
  const found: QualityOption[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;
	const resolution = lines[index].match(/RESOLUTION=(\d+)x(\d+)/);
	const height = resolution ? Math.min(Number(resolution[1]), Number(resolution[2])) : 0;
    const next = lines.slice(index + 1).find((line) => line.trim() && !line.startsWith('#'))?.trim();
    if (!height || !next) continue;
    found.push({ label: `${height}p`, height, url: new URL(next, masterURL).toString() });
  }
  return [...new Map(found.map((option) => [option.height, option])).values()].sort((a, b) => b.height - a.height);
}
