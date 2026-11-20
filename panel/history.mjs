export function recordSample(history, snapshot, limit = 30) {
  if (history.at(-1)?.at === snapshot.scannedAt) return history;
  const cpu = Object.fromEntries(snapshot.groups.flatMap(g => g.terminals).map(t => [t.handle, t.cpu]));
  return [...history, { at: snapshot.scannedAt, cpu }].slice(-limit);
}
export function cpuSeries(history, handles) {
  if (!handles.length) return [];
  return history.map(sample => {
    const values = handles.map(handle => sample.cpu[handle]);
    return { at: sample.at, value: values.every(v => Number.isFinite(v)) ? values.reduce((a,b) => a+b, 0) : null };
  });
}
export function chartGeometry(series, width = 300, height = 30) {
  const maximum = Math.max(10, ...series.map(s => s.value ?? 0));
  const ceiling = Math.ceil(maximum / 10) * 10;
  const start = series[0]?.at ?? 0, end = series.at(-1)?.at ?? start;
  const segments = [];
  let segment = [], previous = null;
  for (const sample of series) {
    if (sample.value === null || previous !== null && sample.at - previous > 30000) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (sample.value !== null) segment.push({ x: end === start ? width : (sample.at - start) / (end - start) * width,
      y: height - Math.max(0, sample.value) / ceiling * height });
    previous = sample.at;
  }
  if (segment.length) segments.push(segment);
  return { ceiling, segments };
}
