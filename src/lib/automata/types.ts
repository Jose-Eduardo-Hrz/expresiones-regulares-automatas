/** Tipos de autómata que produce la aplicación. */
export type AutomatonKind = 'enfa' | 'nfa' | 'dfa' | 'mindfa';

export const AUTOMATON_NAMES: Record<AutomatonKind, string> = {
	enfa: 'AFN-ε',
	nfa: 'AFN',
	dfa: 'AFD',
	mindfa: 'AFD mínimo'
};

export const AUTOMATON_LONG_NAMES: Record<AutomatonKind, string> = {
	enfa: 'Autómata finito no determinista con transiciones ε',
	nfa: 'Autómata finito no determinista (sin transiciones ε)',
	dfa: 'Autómata finito determinista',
	mindfa: 'Autómata finito determinista mínimo'
};

/** Símbolo del alfabeto (un carácter). */
export type AlphabetSymbol = string;

/** Información sobre el origen de un estado según el algoritmo que lo creó. */
export interface StateDetail {
	/** Subconjunto de estados del AFN que representa (subconjuntos). */
	nfaStates?: string[];
	/** Posiciones del árbol aumentado que representa (método directo). */
	positions?: number[];
	/** Estados del AFD original fusionados en este estado (minimización). */
	mergedStates?: string[];
	/** Estado sumidero agregado para completar la función de transición. */
	sink?: boolean;
	/** Nota libre, por ejemplo la subexpresión que originó el estado. */
	note?: string;
}

export interface State {
	/** Identificador único; también es el nombre que se muestra. */
	id: string;
	detail?: StateDetail;
}

export interface Transition {
	id: string;
	from: string;
	to: string;
	/** Símbolo que activa la transición; `null` representa ε. */
	symbol: AlphabetSymbol | null;
}

export interface Automaton {
	kind: AutomatonKind;
	/** Alfabeto: símbolos distintos, ordenados. */
	alphabet: AlphabetSymbol[];
	states: State[];
	start: string;
	accepting: string[];
	transitions: Transition[];
}

/** Elementos resaltados en un paso del algoritmo o de la simulación. */
export interface Highlight {
	/** Elementos protagonistas (nuevos o activos). */
	states: string[];
	transitions: string[];
	/** Elementos de contexto (por ejemplo, los fragmentos que se combinan). */
	contextStates?: string[];
	contextTransitions?: string[];
}

export const EMPTY_HIGHLIGHT: Highlight = { states: [], transitions: [] };
