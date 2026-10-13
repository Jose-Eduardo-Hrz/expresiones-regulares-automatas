import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

// Registro único de la extensión de distribución jerárquica (dagre).
cytoscape.use(dagre);

export { cytoscape };
