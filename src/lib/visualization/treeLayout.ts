import { childrenOf, nodeLabel, postOrder, toRegexString, type RegexNode } from '#lib/regex/ast.ts';
import { formatSet } from '#lib/automata/core.ts';

/** Nodo genérico de árbol para dibujar (AST simple o árbol aumentado). */
export interface TreeNodeView {
	id: number;
	label: string;
	children: number[];
	text: string;
	position?: number;
	nullable?: boolean;
	firstpos?: number[];
	lastpos?: number[];
}

export interface PlacedNode extends TreeNodeView {
	x: number;
	y: number;
	depth: number;
}

export interface TreeLayout {
	nodes: PlacedNode[];
	width: number;
	height: number;
}

/** Convierte el AST en nodos genéricos (orden posterior, raíz al final). */
export function astToTreeNodes(ast: RegexNode): TreeNodeView[] {
	const order = postOrder(ast);
	const index = new Map(order.map((n, i) => [n, i]));
	return order.map((n, i) => ({
		id: i,
		label: nodeLabel(n),
		children: childrenOf(n).map((c) => index.get(c) as number),
		text: toRegexString(n)
	}));
}

/**
 * Distribución clásica: las hojas se reparten de izquierda a derecha y cada
 * nodo interno se centra sobre sus hijos.
 */
export function layoutTree(nodes: TreeNodeView[], annotated: boolean): TreeLayout {
	const root = nodes.length - 1;
	const longestSet = annotated
		? Math.max(0, ...nodes.map((n) => Math.max(formatSet(n.firstpos ?? []).length, formatSet(n.lastpos ?? []).length)))
		: 0;
	const spacing = annotated ? Math.min(180, Math.max(64, longestSet * 7.2 * 1.4 + 30)) : 48;
	const levelHeight = annotated ? 78 : 62;
	const placed = new Map<number, PlacedNode>();
	let leafCursor = 0;
	let maxDepth = 0;

	const place = (id: number, depth: number): PlacedNode => {
		const n = nodes[id] as TreeNodeView;
		maxDepth = Math.max(maxDepth, depth);
		let x: number;
		if (n.children.length === 0) {
			x = leafCursor * spacing;
			leafCursor++;
		} else {
			const kids = n.children.map((c) => place(c, depth + 1));
			x = kids.reduce((s, k) => s + k.x, 0) / kids.length;
		}
		const p: PlacedNode = { ...n, x, y: depth * levelHeight, depth };
		placed.set(id, p);
		return p;
	};
	if (nodes.length > 0) place(root, 0);

	const margin = annotated ? spacing / 2 + 10 : 30;
	const out = [...placed.values()].map((p) => ({ ...p, x: p.x + margin, y: p.y + 30 }));
	return {
		nodes: out.sort((a, b) => a.id - b.id),
		width: Math.max(1, (leafCursor - 1) * spacing + 2 * margin),
		height: maxDepth * levelHeight + 70
	};
}
