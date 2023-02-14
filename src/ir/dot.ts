import { CFG } from "./cfg";
import { FunctionDefinition } from "./definitions";

export function cfgToDot(name: string, cfg?: CFG): string {
    const indent = " ".repeat(2);

    const nodes = [];
    const edges = [];

    if (cfg === undefined) {
        return `digraph "${name}" {}`;
    }

    for (const node of cfg.nodes.values()) {
        const body = node.statements.map((stmt) => stmt.pp().replace(/"/g, '\\"')).join("\n");

        nodes.push(`${node.label} [label="${body}", xlabel="${node.label}"];`);

        for (const edge of node.outgoing) {
            const predicate = edge.predicate === undefined ? "true" : edge.predicate.pp();

            edges.push(`${edge.from.label} -> ${edge.to.label} [label="${predicate}"];`);
        }
    }

    return `digraph "${name}" {
  node[style=filled, color=lightblue1, shape="box"];
  label="${name}";
  labelloc="t"

  ${nodes.join("\n" + indent)}
  ${edges.join("\n" + indent)}
}`;
}

export function fnToDot(fn: FunctionDefinition): string {
    return cfgToDot(fn.name, fn.body);
}
