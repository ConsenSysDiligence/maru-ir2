import { BasicBlock, CFG } from "./cfg";
import { Node } from "./node";

export function copy<T extends CFG | BasicBlock | Node>(input: T): T {
    return input.copy() as unknown as T;
}
