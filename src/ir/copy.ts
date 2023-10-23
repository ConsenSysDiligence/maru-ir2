import { BasicBlock, CFG } from "./cfg";
import { Node } from "./node";

export type TransformerF = (arg: Node) => Node | undefined;

/**
 * Make a copy of the `input` CFG/Block/Node
 */
export function copy<T extends CFG | BasicBlock | Node>(input: T): T {
    return input.copy(undefined) as unknown as T;
}

/**
 * Make a copy of the `input` CFG/Block/Node where some Nodes may be
 * optionally transformed by the passed-in `transformer` function.
 */
export function transform<T extends CFG | BasicBlock | Node>(
    input: T,
    transformer: TransformerF | undefined
): T {
    if (transformer && input instanceof Node) {
        const res = transformer(input);

        if (res !== undefined) {
            return res as unknown as T;
        }
    }

    return input.copy(transformer) as unknown as T;
}
