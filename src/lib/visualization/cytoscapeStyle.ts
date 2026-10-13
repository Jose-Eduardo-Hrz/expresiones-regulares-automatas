import type { StylesheetJson } from 'cytoscape';
import { BLOCK_COLORS } from './graphModel';

/** Lee las variables CSS definidas en Estilos/variables.css. */
function cssVar(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback;
}

export interface GraphPalette {
	card: string;
	navy: string;
	muted: string;
	accent: string;
	accentD: string;
	accentL: string;
	amber: string;
	amberL: string;
	green: string;
	greenL: string;
	red: string;
	redL: string;
	line: string;
	mono: string;
	blocks: string[];
}

export function readPalette(): GraphPalette {
	return {
		card: cssVar('--card', '#ffffff'),
		navy: cssVar('--navy', '#1f2b38'),
		muted: cssVar('--muted', '#5f6a75'),
		accent: cssVar('--accent', '#2a4a86'),
		accentD: cssVar('--accent-d', '#1b3366'),
		accentL: cssVar('--accent-l', '#dbe4f5'),
		amber: cssVar('--amber', '#b87400'),
		amberL: cssVar('--amber-l', '#fdf0d5'),
		green: cssVar('--green', '#1d7a4f'),
		greenL: cssVar('--green-l', '#dcf3e8'),
		red: cssVar('--red', '#c9373c'),
		redL: cssVar('--red-l', '#fde3e3'),
		line: cssVar('--line', '#c9d1cb'),
		// Cytoscape no admite comillas en font-family.
		mono: cssVar('--mono', 'monospace').replace(/['"]/g, ''),
		blocks: Array.from({ length: BLOCK_COLORS }, (_, i) => cssVar(`--block-${i + 1}`, '#eeeeee'))
	};
}

/** Hoja de estilos de Cytoscape coherente con la identidad visual. */
export function buildStylesheet(p: GraphPalette): StylesheetJson {
	return [
		{
			selector: 'node',
			style: {
				shape: 'ellipse',
				width: 'data(w)',
				height: 46,
				'background-color': p.card,
				'border-width': 2.5,
				'border-color': p.navy,
				label: 'data(label)',
				'text-valign': 'center',
				'text-halign': 'center',
				'text-wrap': 'wrap',
				'font-family': p.mono,
				'font-size': 13,
				'font-weight': 600,
				color: p.navy,
				'overlay-opacity': 0,
				'underlay-opacity': 0,
				'underlay-padding': 7,
				'underlay-shape': 'ellipse',
				'transition-property': 'opacity, border-color, background-color, underlay-opacity',
				'transition-duration': 150
			}
		},
		{ selector: 'node.partitioned', style: { height: 54, 'line-height': 1.25 } },
		{ selector: 'node.start', style: { 'background-color': p.accentL } },
		{ selector: 'node.accepting', style: { 'border-style': 'double', 'border-width': 7 } },
		{ selector: 'node.sink', style: { 'border-style': 'dashed', color: p.muted, 'border-color': p.muted } },
		...p.blocks.map((color, i) => ({ selector: `node.block-${i}`, style: { 'background-color': color } })),
		{
			selector: `node#${'__inicio__'}`,
			style: {
				width: 2,
				height: 2,
				'background-opacity': 0,
				'border-width': 0,
				label: '',
				events: 'no'
			}
		},
		{
			selector: 'edge',
			style: {
				'curve-style': 'bezier',
				'control-point-step-size': 44,
				width: 2,
				'line-color': p.navy,
				'target-arrow-color': p.navy,
				'target-arrow-shape': 'triangle',
				'arrow-scale': 1.15,
				label: 'data(label)',
				'font-family': p.mono,
				'font-size': 13,
				'font-weight': 600,
				color: p.navy,
				'text-background-color': p.card,
				'text-background-opacity': 0.92,
				'text-background-padding': '2px',
				'text-background-shape': 'roundrectangle',
				'loop-direction': '-45deg',
				'loop-sweep': '-70deg',
				'overlay-opacity': 0,
				'underlay-opacity': 0,
				'underlay-padding': 5,
				'transition-property': 'opacity, line-color, width',
				'transition-duration': 150
			}
		},
		{
			selector: 'edge.epsilon',
			style: { 'line-style': 'dashed', 'line-dash-pattern': [7, 5], 'line-color': p.muted, 'target-arrow-color': p.muted, color: p.muted }
		},
		{ selector: 'edge.start-arrow', style: { label: '', width: 2.5, events: 'no' } },
		{ selector: '.hidden', style: { display: 'none' } },
		{ selector: '.dim', style: { opacity: 0.28 } },
		{
			selector: 'node.ctx',
			style: { 'border-color': p.accent }
		},
		{ selector: 'edge.ctx', style: { 'line-color': p.accent, 'target-arrow-color': p.accent, color: p.accent } },
		{
			selector: 'node.hl',
			style: {
				'border-color': p.accentD,
				'underlay-color': p.accent,
				'underlay-opacity': 0.25
			}
		},
		{
			selector: 'edge.hl',
			style: {
				width: 4,
				'line-color': p.accentD,
				'target-arrow-color': p.accentD,
				color: p.accentD,
				'underlay-color': p.accent,
				'underlay-opacity': 0.15
			}
		},
		{ selector: 'node.sim-accepted', style: { 'underlay-color': p.green, 'underlay-opacity': 0.4, 'border-color': p.green } },
		{ selector: 'node.sim-rejected', style: { 'underlay-color': p.red, 'underlay-opacity': 0.3, 'border-color': p.red } },
		{
			selector: 'node:selected',
			style: { 'overlay-color': p.amber, 'overlay-opacity': 0.18, 'overlay-padding': 9, 'overlay-shape': 'ellipse' }
		},
		{ selector: 'edge:selected', style: { 'overlay-color': p.amber, 'overlay-opacity': 0.25, 'overlay-padding': 6 } }
	] as StylesheetJson;
}
