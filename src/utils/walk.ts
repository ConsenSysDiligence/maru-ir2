import { Node } from "../ir/node";

/**
 * Walk over the given `node` and all its children, invoking `cb` for each one.
 */
export function walk(node: Node, cb: (n: Node) => any): void {
    cb(node);

    for (const child of node.children()) {
        walk(child, cb);
    }
}

/**
 * Iteratively traverse through node and its children (using a generator).
 */
export function* traverse(node: Node): Generator<Node> {
    yield node;

    for (const child of node.children()) {
        yield* traverse(child);
    }
}
