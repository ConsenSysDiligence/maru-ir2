import { PPAble, StructEqualityComparable } from "../utils";
import { BaseSrc } from "./source";

let nodeCtr = 0;

export abstract class Node implements PPAble, StructEqualityComparable {
    readonly id: number;
    readonly src: BaseSrc;

    constructor(src: BaseSrc) {
        this.id = nodeCtr++;
        this.src = src;
    }

    abstract pp(): string;
    abstract getStructId(): any;
    abstract children(): Iterable<Node>;
}
