# Autómatas · De expresiones regulares a autómatas finitos

Aplicación web educativa que convierte expresiones regulares en autómatas finitos (AFN-ε, AFN, AFD y AFD mínimo), los dibuja, explica cada algoritmo paso a paso y simula cadenas sobre el autómata generado.

## Uso

```sh
pnpm install
pnpm dev        # servidor de desarrollo en http://localhost:5173
pnpm test       # pruebas unitarias (Vitest)
pnpm check      # comprobación de tipos (svelte-check, TypeScript estricto)
pnpm build      # sitio estático en build/
pnpm preview    # sirve la compilación de producción
```

Tecnologías: SvelteKit 3 (Svelte 5), TypeScript estricto, pnpm, Cytoscape.js + dagre para los grafos y Vitest para las pruebas. La aplicación se ejecuta por completo en el navegador (`ssr = false`, adapter-static).

## Funcionalidades

- **Editor** con validación en vivo, errores con la posición marcada y una sugerencia de corrección, botones para insertar ε, ∅ y operadores, ejemplos precargados y alfabeto detectado.
- **Métodos**: Thompson, subconjuntos, construcción directa (nullable/firstpos/lastpos/followpos) y minimización de Hopcroft (desde subconjuntos o desde el método directo).
- **Tipos de salida**: AFN-ε, AFN (eliminación de ε), AFD y AFD mínimo. Las combinaciones que un método no produce se deshabilitan con su motivo; las etapas adicionales se marcan como «adicional» y se explican.
- **Visualización**: estados circulares, flecha inicial, doble círculo para aceptación, transiciones ε punteadas, distribución automática, zoom, desplazamiento, ajuste, arrastre de estados, selección de estados y transiciones, vista «antes/después» de la minimización con los bloques de la partición, exportación a SVG (vectorial) y PNG.
- **Paso a paso**: avanzar, retroceder, reiniciar, reproducción automática y lista de pasos; cada paso describe la operación real del algoritmo y resalta los estados y transiciones implicados. La construcción directa muestra el árbol aumentado anotado y la tabla followpos en cada paso.
- **Simulador**: veredicto, cinta de entrada, animación del recorrido, traza de estados activos (con ε-cerraduras en el AFN-ε) y tratamiento de la cadena vacía.
- **Comparación**: construye el autómata con todos los métodos, comprueba su equivalencia formal (autómata producto) y muestra una matriz de aceptación de cadenas de prueba.

## Estructura

```
Estilos/                  Hojas de estilo del proyecto
  variables.css           Paleta, tipografía, espaciados, bordes y sombras
  global.css              Normalización y tipografía base
  componentes.css         Paneles, botones, campos, pestañas, tablas, chips, avisos
  layout.css              Estructura de la aplicación y adaptación a pantallas
  tema-redes.css, plantilla.html, GUIA-ESTILO.md   Tema original (reveal.js) del que se toma la identidad visual
src/lib/regex/            Tokenizador, analizador descendente recursivo, AST y ejemplos
src/lib/automata/         Tipos (estados, transiciones, autómatas) y operaciones comunes
src/lib/algorithms/       Thompson, subconjuntos, eliminación de ε, método directo,
                          Hopcroft, equivalencia, comparación y pipeline de etapas
src/lib/simulation/       Simulación de cadenas
src/lib/visualization/    Modelo de grafo, estilos de Cytoscape, exportación y árbol
src/lib/components/       Componentes Svelte de la interfaz
src/routes/               Página principal y guía de sintaxis (/ayuda)
tests/                    Pruebas unitarias y pruebas con expresiones aleatorias
```

Los algoritmos no dependen de la interfaz: reciben y devuelven estructuras tipadas (`Automaton`, `AlgorithmStep`, …) y se prueban de forma aislada.

## Sintaxis

| Escribe | Significado |
|---|---|
| `a`–`z`, `A`–`Z`, `0`–`9` | símbolos (un carácter) |
| `ε`, `eps`, `λ` | cadena vacía |
| `∅`, `empty`, `Ø` | lenguaje vacío |
| `+`, `\|`, `∪` | unión |
| `ab` | concatenación (implícita) |
| `*` | cerradura de Kleene |
| `( )` | agrupación |

Precedencia: `*` > concatenación > unión; unión y concatenación asocian por la izquierda.

### Limitaciones

- Sin clases de caracteres, comodines, anclas, `?` ni `+` posfijo (usa `(r+ε)` y `rr*`).
- `eps` y `empty` son palabras reservadas: para concatenar e, p, s escribe `e p s`. `#` está reservado (marcador de fin del método directo).
- Expresión de hasta 100 caracteres; cada construcción se detiene con un mensaje si supera 400 estados; cadenas simuladas de hasta 200 símbolos.

### Decisiones de diseño

- **Thompson** usa la variante en la que la concatenación une los fragmentos con una transición ε (en lugar de fusionar estados), de modo que los estados creados en cada paso no cambian.
- **Eliminación de ε**: δ'(p, a) = mover(ε-cerradura(p), a); p es final si su ε-cerradura contiene un final. Se conservan solo los estados alcanzables.
- **AFD parciales**: por convención no se dibuja el estado sumidero; la opción «Mostrar estado sumidero» lo agrega. La minimización trabaja siempre con el AFD completo.

## Pruebas

`pnpm test` ejecuta 55 pruebas, entre ellas:

- precedencia, asociatividad, ε/∅, impresión canónica y errores del analizador;
- propiedades estructurales del AFN-ε de Thompson; determinismo de subconjuntos y método directo;
- conservación del lenguaje en la eliminación de ε y la minimización mediante **equivalencia formal**;
- minimalidad comprobada con un algoritmo independiente (llenado de tabla);
- 250 expresiones aleatorias en las que todos los métodos se comparan entre sí formalmente y contra un oráculo independiente (`RegExp` de JavaScript) sobre todas las cadenas de longitud ≤ 5.
