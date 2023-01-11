import { CFG } from "./cfg";

export function cfgToDot(name: string, cfg?: CFG): string {
    const indent = " ".repeat(2);

    let nodeTxt = "";
    let edgeTxt = "";

    if (cfg === undefined) {
        return `digraph ${name} {}`;
    }

    for (const node of cfg.nodes.values()) {
        const body = node.statements.map((stmt) => stmt.pp().replace(/"/g, '\\"')).join("\n");

        nodeTxt +=
            indent +
            node.label +
            ' [label="' +
            body +
            '",style=filled,color=lightblue1,shape="box", xlabel="' +
            node.label +
            '"];\n';

        for (const edge of node.outgoing) {
            const predicate = edge.predicate === undefined ? "true" : edge.predicate.pp();

            edgeTxt +=
                indent +
                edge.from.label +
                " -> " +
                edge.to.label +
                '[label="' +
                predicate +
                '"];\n';
        }
    }

    return "digraph " + name + " {\n" + nodeTxt + edgeTxt + "}";
}
