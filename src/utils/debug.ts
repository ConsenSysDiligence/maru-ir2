import { walk } from ".";
import { Program } from "../interp";
import { Node } from "../ir";

/**
 * Walk thourgh an each node of passed `program` and compute its
 * parents (nodes that are referring to the checked one it their subtree).
 *
 * Returns map from each node to an array of referring nodes.
 */
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

/**
 * Apply `computeNodeParents()` to a program and preserve only entries,
 * where one node haves mupltiple parents (is referred by several other node subtrees).
 *
 * It may be considered abnormal if same node is referred twice in same program.
 * Such case may indicate an issue in tree building logic,
 * as changing one node may have cascade effect in unpredictable places.
 *
 * Only exception from this rule if node is reused intentionally
 * (like predefined reserved type reference).
 */
export function findMultiParentNodes(program: Program): Map<Node, Node[]> {
    const res = computeNodeParents(program);

    for (const [node, uses] of res) {
        if (uses.length === 1) {
            res.delete(node);
        }
    }

    return res;
}
