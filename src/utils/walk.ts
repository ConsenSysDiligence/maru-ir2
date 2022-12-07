import { Node } from "../ir/node";

/// Walk over the given `node` and all its children, invoking `cb` for each one
export function walk<SrcT = any>(node: Node<SrcT>, cb: (n: Node<SrcT>) => any): void {
    cb(node);

    for (const child of node.children()) {
        walk(child, cb);
    }
}
