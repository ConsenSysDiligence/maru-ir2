import { Node } from "../ir/node";

/**
 * Walk over the given `node` and all its children, invoking `cb` for each one.
 */
export function walk(node: Node, cb: (n: Node, p?: Node) => any, parent?: Node): void {
    cb(node, parent);

    for (const child of node.children()) {
        walk(child, cb, node);
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
