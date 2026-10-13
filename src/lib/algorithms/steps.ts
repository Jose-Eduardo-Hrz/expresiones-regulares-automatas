import type { Automaton, Highlight } from '#lib/automata/types.ts';
import type { AugmentedTree } from './direct';

/** Etapas que pueden componer una conversión. */
export type StageId = 'thompson' | 'epsilon' | 'subsets' | 'direct' | 'complete' | 'minimize';

export const STAGE_NAMES: Record<StageId, string> = {
	thompson: 'Construcción de Thompson',
	epsilon: 'Eliminación de transiciones ε',
	subsets: 'Construcción por subconjuntos',
	direct: 'Construcción directa (followpos)',
	complete: 'Completar el AFD',
	minimize: 'Minimización (Hopcroft)'
};

/**
 * Qué debe mostrarse en el área principal durante un paso.
 * Las vistas de autómata comparten el objeto final del algoritmo y muestran
 * solo un prefijo de sus estados y transiciones: así el dibujo conserva la
 * misma distribución mientras crece, sin copiar el autómata en cada paso.
 */
export type StepView =
	| {
			kind: 'automaton';
			automaton: Automaton;
			/** Cantidad de estados visibles (prefijo de `automaton.states`). */
			visibleStates?: number;
			/** Cantidad de transiciones visibles (prefijo de `automaton.transitions`). */
			visibleTransitions?: number;
			/** Partición de los estados (minimización). */
			partition?: string[][];
			/**
			 * Ocultar el estado inicial y los finales del autómata completo (por
			 * ejemplo, mientras Thompson construye fragmentos aislados).
			 */
			hideRoles?: boolean;
	  }
	| {
			kind: 'tree';
			tree: AugmentedTree;
			/** Nodos que ya tienen calculados nullable, firstpos y lastpos. */
			computed: number[];
			/** Nodos resaltados. */
			highlight: number[];
			/** Estado de la tabla followpos en este paso (índice = posición − 1). */
			follow?: number[][];
			/** Posiciones cuya fila de followpos cambió en este paso. */
			followHighlight?: number[];
	  };

export interface AlgorithmStep {
	stage: StageId;
	title: string;
	description: string;
	/** Detalle del cálculo, una línea por elemento. */
	details?: string[];
	view: StepView;
	highlight: Highlight;
}
