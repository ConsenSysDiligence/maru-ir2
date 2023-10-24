import { PPAble, StructEqualityComparable } from "../utils";
import { TransformerFn } from "./copy";
import { BaseSrc } from "./source";

let nodeCtr = 0;

export abstract class Node implements PPAble, StructEqualityComparable {
    readonly id: number;
    readonly src: BaseSrc;
    public md = new Map<string, any>();

    constructor(src: BaseSrc) {
        this.id = nodeCtr++;
        this.src = src;
    }

    abstract pp(): string;
    abstract getStructId(): any;
    abstract children(): Iterable<Node>;
    /**
     * Creating a (potentially transformed) copy of this node.
     * NOTE: DON'T CALL DIRECTLY! Instead call `copy()` or `transform` from `copy.ts`.
     */
    abstract copy(t: TransformerFn | undefined): Node;
}
