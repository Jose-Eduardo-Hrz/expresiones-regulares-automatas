<script lang="ts">
	import { resolve } from '$app/paths';
	import { METHODS } from '#lib/algorithms/pipeline.ts';
	import { MAX_STATES } from '#lib/automata/core.ts';
	import { MAX_REGEX_LENGTH } from '#lib/regex/parser.ts';
	import { MAX_INPUT_LENGTH } from '#lib/simulation/simulate.ts';
</script>

<svelte:head>
	<title>Sintaxis y métodos · Autómatas</title>
</svelte:head>

<main class="doc" id="contenido">
	<article class="panel">
		<div class="panel-head"><p class="kicker">Guía</p></div>
		<div class="panel-body">
			<h2>Sintaxis de las expresiones regulares</h2>
			<p>
				Las expresiones se definen sobre un alfabeto finito de símbolos de un carácter. El alfabeto se detecta automáticamente a partir de los
				símbolos que aparecen en la expresión.
			</p>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th scope="col">Construcción</th><th scope="col">Se escribe</th><th scope="col">Lenguaje</th></tr>
					</thead>
					<tbody>
						<tr><td>Símbolo</td><td class="mono">a, b, 0, 1, … (a–z, A–Z, 0–9)</td><td class="mono">{'{a}'}</td></tr>
						<tr><td>Cadena vacía</td><td class="mono">ε · eps · λ</td><td class="mono">{'{ε}'}</td></tr>
						<tr><td>Lenguaje vacío</td><td class="mono">∅ · empty · Ø</td><td class="mono">∅ (ninguna cadena)</td></tr>
						<tr><td>Unión</td><td class="mono">r+s · r|s · r∪s</td><td class="mono">L(r) ∪ L(s)</td></tr>
						<tr><td>Concatenación</td><td class="mono">rs</td><td class="mono">L(r)·L(s)</td></tr>
						<tr><td>Cerradura de Kleene</td><td class="mono">r*</td><td class="mono">L(r)*</td></tr>
						<tr><td>Agrupación</td><td class="mono">(r)</td><td class="mono">L(r)</td></tr>
					</tbody>
				</table>
			</div>

			<h2>Precedencia y asociatividad</h2>
			<p>
				De mayor a menor: cerradura <span class="mono">*</span>, concatenación y unión <span class="mono">+</span>. La unión y la concatenación
				asocian por la izquierda. Así, <span class="mono">a+bc*</span> se lee <span class="mono">a+(b(c*))</span> y
				<span class="mono">abc</span> se lee <span class="mono">(ab)c</span>.
			</p>
			<p>La gramática que implementa el analizador sintáctico (descendente recursivo) es:</p>
			<pre class="grammar">E → C ( ('+' | '|') C )*      unión
C → K K*                      concatenación
K → A '*'*                    cerradura
A → símbolo | ε | ∅ | '(' E ')'</pre>

			<h2>ε frente a ∅</h2>
			<p>
				<span class="mono">ε</span> es la cadena vacía: el lenguaje <span class="mono">{'{ε}'}</span> contiene una cadena (de longitud cero).
				<span class="mono">∅</span> es el lenguaje vacío: no contiene ninguna cadena. Por eso <span class="mono">aε</span> equivale a
				<span class="mono">a</span>, mientras que <span class="mono">a∅</span> equivale a <span class="mono">∅</span>; y
				<span class="mono">a+∅</span> equivale a <span class="mono">a</span>.
			</p>

			<h2>Limitaciones</h2>
			<ul>
				<li>Cada símbolo es un único carácter; no hay clases (<span class="mono">[abc]</span>), rangos, comodines ni anclas.</li>
				<li>
					No existen los operadores <span class="mono">?</span> ni <span class="mono">+</span> posfijo: escribe <span class="mono">(r+ε)</span>
					y <span class="mono">rr*</span>.
				</li>
				<li>
					Las palabras <span class="mono">eps</span> y <span class="mono">empty</span> están reservadas. Para concatenar los símbolos e, p, s
					sepáralos con espacios: <span class="mono">e p s</span>. Los espacios se ignoran en lo demás.
				</li>
				<li>El símbolo <span class="mono">#</span> está reservado como marcador de fin del método directo.</li>
				<li>
					Longitud máxima de la expresión: {MAX_REGEX_LENGTH} caracteres. Cada construcción se detiene si supera {MAX_STATES} estados (la
					determinización puede crecer de forma exponencial). Las cadenas simuladas se limitan a {MAX_INPUT_LENGTH} símbolos.
				</li>
			</ul>

			<h2>Métodos de conversión</h2>
			{#each METHODS as m, i (m.id)}
				<h3 class="method">{i + 1}. {m.name}</h3>
				{#each m.description as paragraph, j (j)}
					<p>{paragraph}</p>
				{/each}
			{/each}

			<h3 class="method">Eliminación de transiciones ε</h3>
			<p>
				Para obtener un AFN sin transiciones ε a partir del AFN-ε se define δ'(p, a) = mover(ε-cerradura(p), a), y un estado p es de
				aceptación si su ε-cerradura contiene un estado de aceptación. Después se conservan solo los estados alcanzables (el inicial y los
				destinos de transiciones con símbolo).
			</p>

			<h3 class="method">Variante de Thompson</h3>
			<p>
				En la concatenación, el final del primer fragmento se une al inicio del segundo con una transición ε, en lugar de fusionar ambos
				estados. Así los estados creados en cada paso no cambian de nombre y el AFN-ε tiene exactamente dos estados por cada símbolo, ε, ∅,
				unión y cerradura.
			</p>

			<h3 class="method">Estado sumidero</h3>
			<p>
				Por convención, los AFD se dibujan parciales: si falta una transición, la cadena se rechaza. La opción «Mostrar estado sumidero» agrega
				el estado <span class="mono">∅</span> al que van todas las transiciones faltantes. La minimización siempre trabaja con el AFD completo
				y, salvo que se pida lo contrario, omite el sumidero del resultado.
			</p>

			<h3 class="method">Tipos de autómata disponibles por método</h3>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th scope="col">Método</th><th scope="col">AFN-ε</th><th scope="col">AFN</th><th scope="col">AFD</th><th scope="col">AFD mínimo</th></tr>
					</thead>
					<tbody>
						<tr><th scope="row">Thompson</th><td>directo</td><td>+ eliminación de ε</td><td>+ subconjuntos</td><td>+ subconjuntos + Hopcroft</td></tr>
						<tr><th scope="row">Subconjuntos</th><td>—</td><td>—</td><td>Thompson + subconjuntos</td><td>+ Hopcroft</td></tr>
						<tr><th scope="row">Directo</th><td>—</td><td>—</td><td>directo</td><td>+ Hopcroft</td></tr>
						<tr><th scope="row">Minimización</th><td>—</td><td>—</td><td>—</td><td>AFD de partida + Hopcroft</td></tr>
					</tbody>
				</table>
			</div>

			<p><a class="btn" href={resolve('/')}>Volver al conversor</a></p>
		</div>
	</article>
</main>

<style>
	.grammar {
		font-family: var(--mono);
		font-size: var(--fs-sm);
		background: var(--surface);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		padding: var(--sp-3);
		overflow-x: auto;
	}

	.method {
		margin-top: var(--sp-4);
	}

	ul {
		padding-left: var(--sp-5);
	}

	li + li {
		margin-top: var(--sp-1);
	}
</style>
