export interface GallerySizedItem {
  width: number;
  height: number;
}

/**
 * Places ranked gallery items into the currently shortest column. The first
 * row always follows rank order; later items may land in either neighboring
 * column so mixed portrait/landscape photos do not create empty grid rows.
 */
export function balanceGalleryColumns<T extends GallerySizedItem>(
  items: T[],
  columnCount: number
): T[][] {
  const count = Math.max(1, Math.floor(columnCount));
  const columns = Array.from({ length: count }, () => [] as T[]);
  const heights = Array.from({ length: count }, () => 0);

  for (const item of items) {
    const columnIndex = heights.indexOf(Math.min(...heights));
    columns[columnIndex].push(item);

    const rawAspect = item.width > 0 && item.height > 0
      ? item.width / item.height
      : 1;
    const displayedAspect = rawAspect > 0.4 && rawAspect < 2.6 ? rawAspect : 1;
    heights[columnIndex] += 1 / displayedAspect;
  }

  return columns;
}
