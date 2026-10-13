import type { Core, EdgeSingular, NodeSingular, Position } from 'cytoscape';
import { START_GHOST } from './graphModel';

const escapeXml = (s: string): string =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/**
 * Reproduce la geometría de las aristas «bezier» de Cytoscape: entre puntos
 * de control consecutivos se intercalan sus puntos medios y se dibujan
 * curvas cuadráticas (así lo hace el renderizador de Cytoscape).
 */
function edgePath(edge: EdgeSingular): { d: string; last: Position; end: Position } {
	const src = edge.sourceEndpoint();
	const tgt = edge.targetEndpoint();
	const ctrl = edge.controlPoints() ?? [];
	if (ctrl.length === 0) {
		return { d: `M${fmt(src.x)},${fmt(src.y)} L${fmt(tgt.x)},${fmt(tgt.y)}`, last: src, end: tgt };
	}
	const pts: Position[] = [src];
	ctrl.forEach((p, i) => {
		pts.push(p);
		const next = ctrl[i + 1];
		if (next) pts.push({ x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 });
	});
	pts.push(tgt);
	let d = `M${fmt(src.x)},${fmt(src.y)}`;
	for (let i = 1; i + 1 < pts.length; i += 2) {
		const c = pts[i] as Position;
		const e = pts[i + 1] as Position;
		d += ` Q${fmt(c.x)},${fmt(c.y)} ${fmt(e.x)},${fmt(e.y)}`;
	}
	return { d, last: ctrl[ctrl.length - 1] as Position, end: tgt };
}

function arrowHead(from: Position, tip: Position, color: string, size: number): string {
	const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
	const back = { x: tip.x - size * Math.cos(angle), y: tip.y - size * Math.sin(angle) };
	const half = size * 0.55;
	const left = { x: back.x + half * Math.sin(angle), y: back.y - half * Math.cos(angle) };
	const right = { x: back.x - half * Math.sin(angle), y: back.y + half * Math.cos(angle) };
	return `<polygon points="${fmt(tip.x)},${fmt(tip.y)} ${fmt(left.x)},${fmt(left.y)} ${fmt(right.x)},${fmt(right.y)}" fill="${color}"/>`;
}

function textBlock(lines: string[], x: number, y: number, attrs: string): string {
	const lineHeight = 15;
	const top = y - ((lines.length - 1) * lineHeight) / 2;
	return lines
		.map(
			(line, i) =>
				`<text x="${fmt(x)}" y="${fmt(top + i * lineHeight)}" ${attrs} text-anchor="middle" dominant-baseline="central">${escapeXml(line)}</text>`
		)
		.join('');
}

function nodeSvg(node: NodeSingular, font: string): string {
	const { x, y } = node.position();
	const rx = node.width() / 2;
	const ry = node.height() / 2;
	const fill = node.style('background-color') as string;
	const stroke = node.style('border-color') as string;
	const borderStyle = node.style('border-style') as string;
	const opacity = Number(node.style('opacity'));
	const dash = borderStyle === 'dashed' ? ' stroke-dasharray="6 4"' : '';
	let shapes: string;
	if (borderStyle === 'double') {
		shapes =
			`<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="2.2"/>` +
			`<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx - 5)}" ry="${fmt(ry - 5)}" fill="none" stroke="${stroke}" stroke-width="2.2"/>`;
	} else {
		shapes = `<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"${dash}/>`;
	}
	const label = String(node.data('label') ?? '');
	const color = node.style('color') as string;
	return `<g opacity="${opacity}">${shapes}${textBlock(label.split('\n'), x, y, `font-family="${escapeXml(font)}" font-size="13" font-weight="600" fill="${color}"`)}</g>`;
}

function edgeSvg(edge: EdgeSingular, font: string, background: string): string {
	const color = edge.style('line-color') as string;
	const width = Number(edge.numericStyle('width'));
	const dashed = edge.style('line-style') === 'dashed';
	const opacity = Number(edge.style('opacity'));
	const { d, last, end } = edgePath(edge);
	let out = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dashed ? ' stroke-dasharray="7 5"' : ''}/>`;
	out += arrowHead(last, end, color, 10 + width);
	const label = String(edge.data('label') ?? '');
	if (label) {
		const m = edge.midpoint();
		const w = [...label].length * 7.9 + 6;
		out += `<rect x="${fmt(m.x - w / 2)}" y="${fmt(m.y - 9)}" width="${fmt(w)}" height="18" rx="3" fill="${background}" fill-opacity="0.92"/>`;
		out += textBlock([label], m.x, m.y, `font-family="${escapeXml(font)}" font-size="13" font-weight="600" fill="${edge.style('color') as string}"`);
	}
	return `<g opacity="${opacity}">${out}</g>`;
}

/**
 * Genera un SVG vectorial del grafo tal como se ve (posiciones, colores y
 * resaltados actuales). Solo incluye los elementos visibles.
 */
export function graphToSvg(cy: Core, options: { font: string; background: string; title: string }): string {
	const visible = cy.elements().filter((e) => e.visible());
	const bb = visible.boundingBox({ includeLabels: true, includeOverlays: false });
	const pad = 24;
	const x0 = bb.x1 - pad;
	const y0 = bb.y1 - pad;
	const w = bb.w + 2 * pad;
	const h = bb.h + 2 * pad;
	const edges = visible.edges().map((e) => edgeSvg(e, options.font, options.background));
	const nodes = visible
		.nodes()
		.filter((n) => n.id() !== START_GHOST)
		.map((n) => nodeSvg(n as NodeSingular, options.font));
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}">`,
		`<title>${escapeXml(options.title)}</title>`,
		`<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(w)}" height="${fmt(h)}" fill="${options.background}"/>`,
		...edges,
		...nodes,
		'</svg>'
	].join('\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo seguro a partir de la expresión. */
export function exportFilename(regex: string, kind: string, extension: string): string {
	const safe = regex
		.replace(/ε/g, 'eps')
		.replace(/∅/g, 'vacio')
		.replace(/[+|]/g, 'o')
		.replace(/\*/g, 'k')
		.replace(/[()]/g, '_')
		.replace(/[^A-Za-z0-9_-]/g, '')
		.slice(0, 40);
	return `automata-${kind}-${safe || 'expresion'}.${extension}`;
}
