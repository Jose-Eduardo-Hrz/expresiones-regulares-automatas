/**
 * Árbol sintáctico abstracto (AST) de las expresiones regulares.
 *
 * Gramática (de menor a mayor precedencia):
 *   unión          E → C (('+' | '|') C)*        asociativa por la izquierda
 *   concatenación  C → K K*                       asociativa por la izquierda
 *   cerradura      K → A '*'*
 *   átomo          A → símbolo | ε | ∅ | '(' E ')'
 */

/** Intervalo [start, end) del texto fuente que ocupa un nodo. */
export interface Span {
	start: number;
	end: number;
}

interface BaseNode {
	/** Identificador único dentro de un árbol (orden posterior de creación). */
	id: number;
	span: Span;
}

export interface SymbolNode extends BaseNode {
	kind: 'symbol';
	value: string;
}

export interface EpsilonNode extends BaseNode {
	kind: 'epsilon';
}

export interface EmptyNode extends BaseNode {
	kind: 'empty';
}

export interface UnionNode extends BaseNode {
	kind: 'union';
	left: RegexNode;
	right: RegexNode;
}

export interface ConcatNode extends BaseNode {
	kind: 'concat';
	left: RegexNode;
	right: RegexNode;
}

export interface StarNode extends BaseNode {
	kind: 'star';
	child: RegexNode;
}

export type RegexNode = SymbolNode | EpsilonNode | EmptyNode | UnionNode | ConcatNode | StarNode;
export type RegexNodeKind = RegexNode['kind'];

export const EPSILON_SYMBOL = 'ε';
export const EMPTY_SYMBOL = '∅';

/** Nivel de precedencia usado para imprimir con el mínimo de paréntesis. */
function precedence(node: RegexNode): number {
	switch (node.kind) {
		case 'union':
			return 1;
		case 'concat':
			return 2;
		case 'star':
			return 3;
		default:
			return 4;
	}
}

function wrap(node: RegexNode, minPrecedence: number): string {
	const text = toRegexString(node);
	return precedence(node) < minPrecedence ? `(${text})` : text;
}

/**
 * Representación canónica de un nodo con el mínimo de paréntesis que
 * conserva la estructura del árbol (los operandos derechos de la misma
 * operación llevan paréntesis porque los operadores asocian por la izquierda).
 */
export function toRegexString(node: RegexNode): string {
	switch (node.kind) {
		case 'symbol':
			return node.value;
		case 'epsilon':
			return EPSILON_SYMBOL;
		case 'empty':
			return EMPTY_SYMBOL;
		case 'union':
			return `${wrap(node.left, 1)}+${wrap(node.right, 2)}`;
		case 'concat':
			return `${wrap(node.left, 2)}${wrap(node.right, 3)}`;
		case 'star':
			return `${wrap(node.child, 3)}*`;
	}
}

/** Hijos de un nodo, de izquierda a derecha. */
export function childrenOf(node: RegexNode): RegexNode[] {
	switch (node.kind) {
		case 'union':
		case 'concat':
			return [node.left, node.right];
		case 'star':
			return [node.child];
		default:
			return [];
	}
}

/** Recorre el árbol en orden posterior (hijos antes que el padre). */
export function postOrder(node: RegexNode): RegexNode[] {
	const out: RegexNode[] = [];
	const visit = (n: RegexNode): void => {
		for (const c of childrenOf(n)) visit(c);
		out.push(n);
	};
	visit(node);
	return out;
}

/** Ordena los símbolos: dígitos, mayúsculas y minúsculas. */
export function compareSymbols(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Alfabeto de la expresión: símbolos distintos que aparecen en ella. */
export function alphabetOf(node: RegexNode): string[] {
	const set = new Set<string>();
	for (const n of postOrder(node)) if (n.kind === 'symbol') set.add(n.value);
	return [...set].sort(compareSymbols);
}

/** Cantidad de nodos del árbol. */
export function sizeOf(node: RegexNode): number {
	return postOrder(node).length;
}

export const KIND_NAMES: Record<RegexNodeKind, string> = {
	symbol: 'símbolo',
	epsilon: 'cadena vacía',
	empty: 'lenguaje vacío',
	union: 'unión',
	concat: 'concatenación',
	star: 'cerradura de Kleene'
};

/** Etiqueta corta del operador, usada al dibujar árboles. */
export function nodeLabel(node: RegexNode): string {
	switch (node.kind) {
		case 'symbol':
			return node.value;
		case 'epsilon':
			return EPSILON_SYMBOL;
		case 'empty':
			return EMPTY_SYMBOL;
		case 'union':
			return '+';
		case 'concat':
			return '·';
		case 'star':
			return '*';
	}
}
