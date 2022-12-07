import { PPAble, StructEqualityComparable } from "../utils";

export abstract class Node<SrcT> implements PPAble, StructEqualityComparable {
    readonly id: number;
    readonly src: SrcT;

    constructor(id: number, src: SrcT) {
        this.id = id;
        this.src = src;
    }

    abstract pp(): string;
    abstract getStructId(): any;
    abstract children(): Iterable<Node<SrcT>>;
}
