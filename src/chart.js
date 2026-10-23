// Dependency-free SVG bar chart. Colours come from CSS variables so it follows the theme.

const SVG_NS = "http://www.w3.org/2000/svg";

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Rounds a max value up to a tidy axis ceiling (e.g. 37,500 -> 40,000). */
export function niceCeil(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= value);
  return step * pow;
}

/**
 * @param {HTMLElement} container
 * @param {{label: string, total: number}[]} data
 * @param {{format: (n: number) => string, compact: (n: number) => string}} fmt
 */
export function renderBarChart(container, data, fmt) {
  const W = Math.max(300, Math.round(container.clientWidth || 560));
  const H = 260;
  const pad = { top: 28, right: 8, bottom: 30, left: 48 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceCeil(Math.max(...data.map((d) => d.total)));
  const slot = innerW / data.length;
  const barW = Math.min(44, slot * 0.56);

  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": `Revenue for the last ${data.length} months`,
    class: "bar-chart",
  });

  // Gridlines + y labels
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const y = pad.top + innerH - (v / max) * innerH;
    svg.append(el("line", { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: i === 0 ? "axis" : "grid" }));
    svg.append(el("text", { x: pad.left - 8, y: y + 4, "text-anchor": "end", class: "tick" }, fmt.compact(v)));
  }

  data.forEach((d, i) => {
    const h = (d.total / max) * innerH;
    const x = pad.left + slot * i + (slot - barW) / 2;
    const y = pad.top + innerH - h;
    const isLast = i === data.length - 1;
    const bar = el("rect", { x, y, width: barW, height: Math.max(h, 0), rx: 4, class: isLast ? "bar bar--current" : "bar" });
    bar.append(el("title", {}, `${d.label}: ${fmt.format(d.total)}`));
    svg.append(bar);
    svg.append(el("text", { x: x + barW / 2, y: y - 8, "text-anchor": "middle", class: "value" }, fmt.compact(d.total)));
    svg.append(el("text", { x: x + barW / 2, y: H - 8, "text-anchor": "middle", class: "tick" }, d.label));
  });

  container.replaceChildren(svg);
}
