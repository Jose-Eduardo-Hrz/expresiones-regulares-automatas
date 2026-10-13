import { SINK_STATE } from '#lib/automata/core.ts';
import type { Automaton, Highlight, Transition } from '#lib/automata/types.ts';

/** Transiciones agrupadas por par (origen, destino): una flecha por par. */
export interface EdgeGroup {
	id: string;
	from: string;
	to: string;
	transitions: Transition[];
}

export const START_GHOST = '__inicio__';

/** Etiqueta de una flecha: símbolos separados por comas, ε al final. */
export function edgeLabel(transitions: readonly Transition[]): string {
	const symbols = [...new Set(transitions.map((t) => t.symbol))];
	symbols.sort((a, b) => (a === null ? 1 : b === null ? -1 : a < b ? -1 : a > b ? 1 : 0));
	return symbols.map((s) => s ?? 'ε').join(', ');
}

export function groupTransitions(a: Automaton): EdgeGroup[] {
	const groups = new Map<string, EdgeGroup>();
	for (const t of a.transitions) {
		const key = `${t.from}\u0000${t.to}`;
		let g = groups.get(key);
		if (!g) groups.set(key, (g = { id: `e${groups.size}`, from: t.from, to: t.to, transitions: [] }));
		g.transitions.push(t);
	}
	return [...groups.values()];
}

/** Decoración del grafo: qué parte es visible y qué se resalta. */
export interface GraphDecoration {
	/** Estados visibles (prefijo); por defecto, todos. */
	visibleStates?: number;
	/** Transiciones visibles (prefijo); por defecto, todas. */
	visibleTransitions?: number;
	highlight?: Highlight;
	/** Partición de los estados en bloques (minimización). */
	partition?: string[][];
	/** Ocultar la flecha inicial y los dobles círculos. */
	hideRoles?: boolean;
	/** Veredicto de la simulación, para marcar los estados activos finales. */
	verdict?: 'accepted' | 'rejected';
}

export const BLOCK_COLORS = 8;

/** Ancho del nodo según la longitud de su nombre. */
export function nodeWidth(label: string): number {
	const longest = Math.max(...label.split('\n').map((l) => [...l].length));
	return Math.max(46, Math.round(longest * 8.4 + 22));
}

/** Nombre del bloque al que pertenece cada estado. */
export function blockIndex(partition: string[][] | undefined): Map<string, number> {
	const map = new Map<string, number>();
	partition?.forEach((block, i) => block.forEach((s) => map.set(s, i)));
	return map;
}

export function isSinkState(a: Automaton, id: string): boolean {
	return id === SINK_STATE || a.states.find((s) => s.id === id)?.detail?.sink === true;
}
