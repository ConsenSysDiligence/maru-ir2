import { walk } from ".";
import { Program } from "../interp";
import { Node } from "../ir";

export function computeNodeParents(program: Program): Map<Node, Node[]> {
    const res = new Map<Node, Node[]>();

    for (const def of program) {
        walk(def, (child, parent) => {
            if (parent === undefined) {
                return;
            }

            const uses = res.get(child);

            if (uses) {
                uses.push(parent);
            } else {
                res.set(child, [parent]);
            }
        });
    }

    return res;
}

export function findMultiParentNodes(program: Program): Map<Node, Node[]> {
    const res = computeNodeParents(program);

    for (const [node, uses] of res) {
        if (uses.length === 1) {
            res.delete(node);
        }
    }

    return res;
}
