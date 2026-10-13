import type { Automaton, Transition } from './types';

/** Número máximo de estados que puede producir una construcción. */
export const MAX_STATES = 400;

/** Se lanza cuando una construcción excede {@link MAX_STATES}. */
export class AutomatonLimitError extends Error {
	constructor(what: string, limit = MAX_STATES) {
		super(
			`${what} supera el límite de ${limit} estados. Simplifica la expresión para obtener un autómata manejable.`
		);
		this.name = 'AutomatonLimitError';
	}
}

export const SINK_STATE = '∅';

/**
 * Índice de consulta rápida sobre un autómata: transiciones salientes por
 * estado y símbolo, y el orden de los estados para presentar conjuntos.
 */
export class AutomatonIndex {
	readonly automaton: Automaton;
	readonly order = new Map<string, number>();
	readonly accepting: ReadonlySet<string>;
	private readonly outgoing = new Map<string, Map<string | null, Transition[]>>();

	constructor(automaton: Automaton) {
		this.automaton = automaton;
		automaton.states.forEach((s, i) => this.order.set(s.id, i));
		this.accepting = new Set(automaton.accepting);
		for (const t of automaton.transitions) {
			let bySymbol = this.outgoing.get(t.from);
			if (!bySymbol) this.outgoing.set(t.from, (bySymbol = new Map()));
			const list = bySymbol.get(t.symbol);
			if (list) list.push(t);
			else bySymbol.set(t.symbol, [t]);
		}
	}

	/** Transiciones que salen de `state` con `symbol` (`null` = ε). */
	transitionsFrom(state: string, symbol: string | null): Transition[] {
		return this.outgoing.get(state)?.get(symbol) ?? [];
	}

	/** Todas las transiciones que salen de `state`. */
	allFrom(state: string): Transition[] {
		const bySymbol = this.outgoing.get(state);
		return bySymbol ? [...bySymbol.values()].flat() : [];
	}

	targets(state: string, symbol: string | null): string[] {
		return this.transitionsFrom(state, symbol).map((t) => t.to);
	}

	/** Ordena y elimina duplicados según el orden de creación de los estados. */
	sort(states: Iterable<string>): string[] {
		return [...new Set(states)].sort((a, b) => (this.order.get(a) ?? 0) - (this.order.get(b) ?? 0));
	}

	isAccepting(state: string): boolean {
		return this.accepting.has(state);
	}
}

export interface SetWithTransitions {
	states: string[];
	transitions: string[];
}

/** ε-cerradura de un conjunto de estados, con las transiciones ε recorridas. */
export function epsilonClosureDetailed(index: AutomatonIndex, states: Iterable<string>): SetWithTransitions {
	const seen = new Set<string>(states);
	const stack = [...seen];
	const used: string[] = [];
	while (stack.length > 0) {
		const s = stack.pop() as string;
		for (const t of index.transitionsFrom(s, null)) {
			used.push(t.id);
			if (!seen.has(t.to)) {
				seen.add(t.to);
				stack.push(t.to);
			}
		}
	}
	return { states: index.sort(seen), transitions: used };
}

export function epsilonClosure(index: AutomatonIndex, states: Iterable<string>): string[] {
	return epsilonClosureDetailed(index, states).states;
}

/** Estados alcanzables desde `states` consumiendo exactamente `symbol`. */
export function moveDetailed(index: AutomatonIndex, states: Iterable<string>, symbol: string): SetWithTransitions {
	const targets: string[] = [];
	const used: string[] = [];
	for (const s of states) {
		for (const t of index.transitionsFrom(s, symbol)) {
			targets.push(t.to);
			used.push(t.id);
		}
	}
	return { states: index.sort(targets), transitions: used };
}

export function move(index: AutomatonIndex, states: Iterable<string>, symbol: string): string[] {
	return moveDetailed(index, states, symbol).states;
}

/** Notación de conjunto: «{q0, q1}» o «∅». */
export function formatSet(items: readonly (string | number)[]): string {
	return items.length === 0 ? '∅' : `{${items.join(', ')}}`;
}

export function formatSymbol(symbol: string | null): string {
	return symbol ?? 'ε';
}

/** Nombres de estado A, B, …, Z, AA, AB, … */
export function letterName(index: number): string {
	let n = index;
	let name = '';
	do {
		name = String.fromCharCode(65 + (n % 26)) + name;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return name;
}

/** `true` si no hay transiciones ε ni dos transiciones con el mismo símbolo desde un estado. */
export function isDeterministic(a: Automaton): boolean {
	const seen = new Set<string>();
	for (const t of a.transitions) {
		if (t.symbol === null) return false;
		const key = `${t.from}\u0000${t.symbol}`;
		if (seen.has(key)) return false;
		seen.add(key);
	}
	return true;
}

/** `true` si el AFD tiene una transición para cada estado y cada símbolo. */
export function isComplete(a: Automaton): boolean {
	const index = new AutomatonIndex(a);
	return a.states.every((s) => a.alphabet.every((c) => index.transitionsFrom(s.id, c).length > 0));
}

/** Estados alcanzables desde el inicial (por cualquier transición, incluidas ε). */
export function reachableStates(a: Automaton): string[] {
	const index = new AutomatonIndex(a);
	const seen = new Set([a.start]);
	const queue = [a.start];
	while (queue.length > 0) {
		const s = queue.shift() as string;
		for (const t of index.allFrom(s)) {
			if (!seen.has(t.to)) {
				seen.add(t.to);
				queue.push(t.to);
			}
		}
	}
	return index.sort(seen);
}

/** Copia del autómata sin los estados inalcanzables. */
export function removeUnreachable(a: Automaton): { automaton: Automaton; removed: string[] } {
	const reachable = new Set(reachableStates(a));
	const removed = a.states.filter((s) => !reachable.has(s.id)).map((s) => s.id);
	if (removed.length === 0) return { automaton: a, removed };
	return {
		automaton: {
			...a,
			states: a.states.filter((s) => reachable.has(s.id)),
			accepting: a.accepting.filter((s) => reachable.has(s)),
			transitions: a.transitions.filter((t) => reachable.has(t.from) && reachable.has(t.to))
		},
		removed
	};
}

/**
 * Completa un AFD parcial agregando un estado sumidero no final al que van
 * todas las transiciones faltantes (incluidas las del propio sumidero).
 */
export function completeDfa(a: Automaton): { automaton: Automaton; added: Transition[] } {
	const index = new AutomatonIndex(a);
	const added: Transition[] = [];
	let n = a.transitions.length;
	for (const s of a.states) {
		for (const c of a.alphabet) {
			if (index.transitionsFrom(s.id, c).length === 0) {
				added.push({ id: `t${n++}`, from: s.id, to: SINK_STATE, symbol: c });
			}
		}
	}
	if (added.length === 0) return { automaton: a, added };
	for (const c of a.alphabet) added.push({ id: `t${n++}`, from: SINK_STATE, to: SINK_STATE, symbol: c });
	return {
		automaton: {
			...a,
			states: [...a.states, { id: SINK_STATE, detail: { sink: true, note: 'Estado sumidero: ninguna cadena se acepta desde aquí.' } }],
			transitions: [...a.transitions, ...added]
		},
		added
	};
}

/**
 * Estados muertos: no finales y desde los que no se alcanza ningún estado
 * final. En un AFD mínimo hay a lo sumo uno (el sumidero).
 */
export function deadStates(a: Automaton): string[] {
	const reverse = new Map<string, string[]>();
	for (const t of a.transitions) {
		const list = reverse.get(t.to);
		if (list) list.push(t.from);
		else reverse.set(t.to, [t.from]);
	}
	const alive = new Set(a.accepting);
	const queue = [...a.accepting];
	while (queue.length > 0) {
		const s = queue.shift() as string;
		for (const p of reverse.get(s) ?? []) {
			if (!alive.has(p)) {
				alive.add(p);
				queue.push(p);
			}
		}
	}
	return a.states.filter((s) => !alive.has(s.id)).map((s) => s.id);
}

export interface AutomatonStats {
	states: number;
	transitions: number;
	epsilonTransitions: number;
	accepting: number;
	deterministic: boolean;
	complete: boolean;
}

export function automatonStats(a: Automaton): AutomatonStats {
	return {
		states: a.states.length,
		transitions: a.transitions.length,
		epsilonTransitions: a.transitions.filter((t) => t.symbol === null).length,
		accepting: a.accepting.length,
		deterministic: isDeterministic(a),
		complete: isDeterministic(a) && isComplete(a)
	};
}

export interface TransitionTableRow {
	state: string;
	isStart: boolean;
	isAccepting: boolean;
	/** Destinos por columna, en el mismo orden que `symbols`. */
	cells: string[][];
}

export interface TransitionTable {
	/** Columnas: símbolos del alfabeto y, si existen transiciones ε, `null`. */
	symbols: (string | null)[];
	rows: TransitionTableRow[];
}

export function transitionTable(a: Automaton): TransitionTable {
	const index = new AutomatonIndex(a);
	const symbols: (string | null)[] = [...a.alphabet];
	if (a.transitions.some((t) => t.symbol === null)) symbols.push(null);
	const accepting = new Set(a.accepting);
	return {
		symbols,
		rows: a.states.map((s) => ({
			state: s.id,
			isStart: s.id === a.start,
			isAccepting: accepting.has(s.id),
			cells: symbols.map((c) => index.sort(index.targets(s.id, c)))
		}))
	};
}
