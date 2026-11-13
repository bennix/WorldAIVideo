export function zoomImage(transform, factor, anchor = { x: 0, y: 0 }) {
  const scale = Math.max(0.25, Math.min(8, transform.scale * factor));
  const ratio = scale / transform.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - transform.x) * ratio,
    y: anchor.y - (anchor.y - transform.y) * ratio,
  };
}
