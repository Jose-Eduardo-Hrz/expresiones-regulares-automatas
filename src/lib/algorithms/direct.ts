import { alphabetOf, toRegexString, type RegexNode } from '#lib/regex/ast.ts';
import { AutomatonLimitError, MAX_STATES, formatSet, letterName } from '#lib/automata/core.ts';
import type { Automaton } from '#lib/automata/types.ts';
import type { AlgorithmStep } from './steps';

export type AugmentedNodeKind = RegexNode['kind'] | 'end';

/** Nodo del árbol aumentado (r)# con sus funciones calculadas. */
export interface AugmentedNode {
	/** Índice en orden posterior. */
	id: number;
	kind: AugmentedNodeKind;
	/** Etiqueta del nodo: símbolo, ε, ∅, #, +, · o *. */
	label: string;
	/** Posición de la hoja (solo símbolos y #). */
	position?: number;
	children: number[];
	nullable: boolean;
	firstpos: number[];
	lastpos: number[];
	/** Subexpresión que representa el nodo. */
	text: string;
}

export interface PositionInfo {
	position: number;
	/** Símbolo de la posición; «#» para el marcador de fin. */
	symbol: string;
	node: number;
}

export interface AugmentedTree {
	/** Nodos en orden posterior; el último es la raíz. */
	nodes: AugmentedNode[];
	root: number;
	positions: PositionInfo[];
	/** followpos(i) en `followpos[i - 1]`. */
	followpos: number[][];
	endPosition: number;
}

export interface DirectResult {
	automaton: Automaton;
	tree: AugmentedTree;
	steps: AlgorithmStep[];
}

const union = (a: number[], b: number[]): number[] => [...new Set([...a, ...b])].sort((x, y) => x - y);
const bool = (v: boolean): string => (v ? 'verdadero' : 'falso');

/** Construye el árbol aumentado (r)# y numera las posiciones de izquierda a derecha. */
export function buildAugmentedTree(ast: RegexNode): AugmentedTree {
	const nodes: AugmentedNode[] = [];
	const positions: PositionInfo[] = [];

	const leaf = (kind: AugmentedNodeKind, label: string, text: string, symbol?: string): number => {
		const id = nodes.length;
		const node: AugmentedNode = { id, kind, label, children: [], nullable: false, firstpos: [], lastpos: [], text };
		if (symbol !== undefined) {
			node.position = positions.length + 1;
			positions.push({ position: node.position, symbol, node: id });
			node.firstpos = [node.position];
			node.lastpos = [node.position];
		} else if (kind === 'epsilon') {
			node.nullable = true;
		}
		nodes.push(node);
		return id;
	};

	const visit = (n: RegexNode): number => {
		const text = toRegexString(n);
		switch (n.kind) {
			case 'symbol':
				return leaf('symbol', n.value, text, n.value);
			case 'epsilon':
				return leaf('epsilon', 'ε', text);
			case 'empty':
				return leaf('empty', '∅', text);
			case 'union':
			case 'concat': {
				const l = visit(n.left);
				const r = visit(n.right);
				const id = nodes.length;
				nodes.push({
					id,
					kind: n.kind,
					label: n.kind === 'union' ? '+' : '·',
					children: [l, r],
					nullable: false,
					firstpos: [],
					lastpos: [],
					text
				});
				return id;
			}
			case 'star': {
				const c = visit(n.child);
				const id = nodes.length;
				nodes.push({ id, kind: 'star', label: '*', children: [c], nullable: true, firstpos: [], lastpos: [], text });
				return id;
			}
		}
	};

	const body = visit(ast);
	const end = leaf('end', '#', '#', '#');
	const root = nodes.length;
	nodes.push({
		id: root,
		kind: 'concat',
		label: '·',
		children: [body, end],
		nullable: false,
		firstpos: [],
		lastpos: [],
		text: `(${toRegexString(ast)})#`
	});

	// nullable, firstpos y lastpos en orden posterior.
	for (const node of nodes) {
		const [c1, c2] = node.children.map((c) => nodes[c] as AugmentedNode);
		if (node.kind === 'union' && c1 && c2) {
			node.nullable = c1.nullable || c2.nullable;
			node.firstpos = union(c1.firstpos, c2.firstpos);
			node.lastpos = union(c1.lastpos, c2.lastpos);
		} else if (node.kind === 'concat' && c1 && c2) {
			node.nullable = c1.nullable && c2.nullable;
			node.firstpos = c1.nullable ? union(c1.firstpos, c2.firstpos) : [...c1.firstpos];
			node.lastpos = c2.nullable ? union(c1.lastpos, c2.lastpos) : [...c2.lastpos];
		} else if (node.kind === 'star' && c1) {
			node.nullable = true;
			node.firstpos = [...c1.firstpos];
			node.lastpos = [...c1.lastpos];
		}
	}

	// followpos: reglas de la concatenación y de la cerradura.
	const followpos: number[][] = positions.map(() => []);
	for (const node of nodes) {
		const [c1, c2] = node.children.map((c) => nodes[c] as AugmentedNode);
		if (node.kind === 'concat' && c1 && c2) {
			for (const i of c1.lastpos) followpos[i - 1] = union(followpos[i - 1] ?? [], c2.firstpos);
		} else if (node.kind === 'star') {
			for (const i of node.lastpos) followpos[i - 1] = union(followpos[i - 1] ?? [], node.firstpos);
		}
	}

	return { nodes, root, positions, followpos, endPosition: positions.length };
}

/** Explica cómo se obtienen nullable, firstpos y lastpos de un nodo interno. */
function explainNode(node: AugmentedNode, nodes: AugmentedNode[]): string[] {
	const [c1, c2] = node.children.map((c) => nodes[c] as AugmentedNode);
	const fs = formatSet;
	if (node.kind === 'union' && c1 && c2) {
		return [
			`nullable = nullable(c₁) ∨ nullable(c₂) = ${bool(c1.nullable)} ∨ ${bool(c2.nullable)} = ${bool(node.nullable)}`,
			`firstpos = firstpos(c₁) ∪ firstpos(c₂) = ${fs(c1.firstpos)} ∪ ${fs(c2.firstpos)} = ${fs(node.firstpos)}`,
			`lastpos = lastpos(c₁) ∪ lastpos(c₂) = ${fs(c1.lastpos)} ∪ ${fs(c2.lastpos)} = ${fs(node.lastpos)}`
		];
	}
	if (node.kind === 'concat' && c1 && c2) {
		return [
			`nullable = nullable(c₁) ∧ nullable(c₂) = ${bool(c1.nullable)} ∧ ${bool(c2.nullable)} = ${bool(node.nullable)}`,
			c1.nullable
				? `c₁ es anulable → firstpos = firstpos(c₁) ∪ firstpos(c₂) = ${fs(c1.firstpos)} ∪ ${fs(c2.firstpos)} = ${fs(node.firstpos)}`
				: `c₁ no es anulable → firstpos = firstpos(c₁) = ${fs(node.firstpos)}`,
			c2.nullable
				? `c₂ es anulable → lastpos = lastpos(c₁) ∪ lastpos(c₂) = ${fs(c1.lastpos)} ∪ ${fs(c2.lastpos)} = ${fs(node.lastpos)}`
				: `c₂ no es anulable → lastpos = lastpos(c₂) = ${fs(node.lastpos)}`
		];
	}
	if (node.kind === 'star' && c1) {
		return [
			'nullable = verdadero (la cerradura siempre acepta ε)',
			`firstpos = firstpos(c₁) = ${fs(node.firstpos)}`,
			`lastpos = lastpos(c₁) = ${fs(node.lastpos)}`
		];
	}
	return [];
}

/**
 * Construcción directa de un AFD a partir de la expresión regular
 * (algoritmo de Aho, Sethi y Ullman). No pasa por ningún AFN: los estados
 * del AFD son conjuntos de posiciones del árbol aumentado.
 */
export function directConstruction(ast: RegexNode): DirectResult {
	const tree = buildAugmentedTree(ast);
	const { nodes, positions, followpos, endPosition } = tree;
	const rootNode = nodes[tree.root] as AugmentedNode;
	const steps: AlgorithmStep[] = [];
	const computed: number[] = [];
	const fs = formatSet;

	// 1. Árbol aumentado.
	steps.push({
		stage: 'direct',
		title: 'Árbol sintáctico aumentado',
		description: `Se concatena el marcador de fin # a la expresión: (${toRegexString(ast)})#. Cada hoja con un símbolo recibe una posición, numerada de izquierda a derecha; ε y ∅ no tienen posición.`,
		details: positions.map((p) => `Posición ${p.position}: ${p.symbol === '#' ? '# (marcador de fin)' : `«${p.symbol}»`}`),
		view: { kind: 'tree', tree, computed: [], highlight: positions.map((p) => p.node) },
		highlight: { states: [], transitions: [] }
	});

	// 2. Hojas.
	const leaves = nodes.filter((n) => n.children.length === 0);
	computed.push(...leaves.map((n) => n.id));
	const leafDetails: string[] = [];
	if (leaves.some((n) => n.position !== undefined)) {
		leafDetails.push('Hoja con posición i: nullable = falso, firstpos = lastpos = {i}');
	}
	if (leaves.some((n) => n.kind === 'epsilon')) leafDetails.push('Hoja ε: nullable = verdadero, firstpos = lastpos = ∅');
	if (leaves.some((n) => n.kind === 'empty')) leafDetails.push('Hoja ∅: nullable = falso, firstpos = lastpos = ∅');
	steps.push({
		stage: 'direct',
		title: 'Funciones de las hojas',
		description: 'Las hojas se calculan directamente a partir de su definición.',
		details: leafDetails,
		view: { kind: 'tree', tree, computed: [...computed], highlight: leaves.map((n) => n.id) },
		highlight: { states: [], transitions: [] }
	});

	// 3. Nodos internos, en orden posterior.
	for (const node of nodes) {
		if (node.children.length === 0) continue;
		computed.push(node.id);
		const kindName = node.kind === 'union' ? 'unión' : node.kind === 'concat' ? 'concatenación' : 'cerradura';
		steps.push({
			stage: 'direct',
			title: `Nodo ${node.label} «${node.text}»`,
			description: `Nodo de ${kindName}: sus funciones se obtienen de las de sus hijos (c₁${node.children.length > 1 ? ' y c₂' : ''}), ya calculadas.`,
			details: explainNode(node, nodes),
			view: { kind: 'tree', tree, computed: [...computed], highlight: [node.id, ...node.children] },
			highlight: { states: [], transitions: [] }
		});
	}

	// 4. followpos.
	const follow: number[][] = positions.map(() => []);
	for (const node of nodes) {
		const [c1, c2] = node.children.map((c) => nodes[c] as AugmentedNode);
		let rule: string;
		let sources: number[];
		let added: number[];
		if (node.kind === 'concat' && c1 && c2) {
			sources = c1.lastpos;
			added = c2.firstpos;
			rule = `Regla de la concatenación: para cada i en lastpos(c₁) = ${fs(sources)}, followpos(i) incluye firstpos(c₂) = ${fs(added)}.`;
		} else if (node.kind === 'star') {
			sources = node.lastpos;
			added = node.firstpos;
			rule = `Regla de la cerradura: para cada i en lastpos(n) = ${fs(sources)}, followpos(i) incluye firstpos(n) = ${fs(added)}.`;
		} else {
			continue;
		}
		for (const i of sources) follow[i - 1] = union(follow[i - 1] ?? [], added);
		steps.push({
			stage: 'direct',
			title: `followpos desde ${node.label} «${node.text}»`,
			description: rule,
			details:
				sources.length === 0 || added.length === 0
					? ['No se agrega nada: uno de los dos conjuntos es vacío.']
					: sources.map((i) => `followpos(${i}) = ${fs(follow[i - 1] ?? [])}`),
			view: {
				kind: 'tree',
				tree,
				computed: [...computed],
				highlight: [node.id],
				follow: follow.map((f) => [...f]),
				followHighlight: [...sources]
			},
			highlight: { states: [], transitions: [] }
		});
	}

	// 5. Construcción del AFD.
	const symbolAt = new Map(positions.map((p) => [p.position, p.symbol]));
	const alphabet = alphabetOf(ast);
	const dfa: Automaton = { kind: 'dfa', alphabet, states: [], start: '', accepting: [], transitions: [] };
	const byKey = new Map<string, string>();
	const sets = new Map<string, number[]>();
	const addState = (set: number[]): { id: string; created: boolean } => {
		const key = set.join(',');
		const existing = byKey.get(key);
		if (existing) return { id: existing, created: false };
		if (dfa.states.length >= MAX_STATES) throw new AutomatonLimitError('El AFD de la construcción directa');
		const id = letterName(dfa.states.length);
		byKey.set(key, id);
		sets.set(id, set);
		dfa.states.push({ id, detail: { positions: set } });
		if (set.includes(endPosition)) dfa.accepting.push(id);
		return { id, created: true };
	};
	const acceptanceNote = (id: string, set: number[]): string =>
		set.includes(endPosition)
			? `${id} contiene la posición ${endPosition} del marcador # → es de aceptación.`
			: `${id} no contiene la posición ${endPosition} del marcador # → no es de aceptación.`;
	const dfaView = (): AlgorithmStep['view'] => ({
		kind: 'automaton',
		automaton: dfa,
		visibleStates: dfa.states.length,
		visibleTransitions: dfa.transitions.length
	});

	const start = addState(rootNode.firstpos);
	dfa.start = start.id;
	steps.push({
		stage: 'direct',
		title: `Estado inicial ${start.id}`,
		description: 'El estado inicial del AFD es firstpos de la raíz: las posiciones que pueden aparecer al principio de una cadena del lenguaje.',
		details: [`firstpos(raíz) = ${fs(rootNode.firstpos)} = ${start.id}`, acceptanceNote(start.id, rootNode.firstpos)],
		view: dfaView(),
		highlight: { states: [start.id], transitions: [] }
	});

	const queue = [start.id];
	while (queue.length > 0) {
		const current = queue.shift() as string;
		const set = sets.get(current) as number[];
		const details: string[] = [];
		const createdStates: string[] = [];
		const createdTransitions: string[] = [];
		for (const symbol of alphabet) {
			const withSymbol = set.filter((p) => symbolAt.get(p) === symbol);
			if (withSymbol.length === 0) {
				details.push(`Ninguna posición de ${current} tiene «${symbol}» → sin transición.`);
				continue;
			}
			const target = withSymbol.reduce<number[]>((acc, p) => union(acc, followpos[p - 1] ?? []), []);
			const formula = `${withSymbol.map((p) => `followpos(${p})`).join(' ∪ ')} = ${fs(target)}`;
			if (target.length === 0) {
				details.push(`Posiciones con «${symbol}»: ${fs(withSymbol)}; ${formula} → sin transición.`);
				continue;
			}
			const result = addState(target);
			const tid = `t${dfa.transitions.length}`;
			dfa.transitions.push({ id: tid, from: current, to: result.id, symbol });
			createdTransitions.push(tid);
			if (result.created) {
				createdStates.push(result.id);
				queue.push(result.id);
				details.push(
					`Posiciones con «${symbol}»: ${fs(withSymbol)}; ${formula} → nuevo estado ${result.id}. ${acceptanceNote(result.id, target)}`
				);
			} else {
				details.push(`Posiciones con «${symbol}»: ${fs(withSymbol)}; ${formula} → ya existe: ${result.id}.`);
			}
		}
		steps.push({
			stage: 'direct',
			title: `Procesar ${current} = ${fs(set)}`,
			description: `Para cada símbolo a, la transición desde ${current} va a la unión de followpos(p) de las posiciones p de ${current} que corresponden a a.`,
			details,
			view: dfaView(),
			highlight: { states: createdStates, transitions: createdTransitions, contextStates: [current] }
		});
	}

	steps.push({
		stage: 'direct',
		title: 'AFD completo',
		description: `No quedan estados sin marcar. Son de aceptación los estados que contienen la posición ${endPosition} del marcador #: ${fs(dfa.accepting)}.`,
		details: dfa.states.map((s) => `${s.id} = ${fs(s.detail?.positions ?? [])}`),
		view: { kind: 'automaton', automaton: dfa },
		highlight: { states: [...dfa.accepting], transitions: [] }
	});

	return { automaton: dfa, tree, steps };
}
