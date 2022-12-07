import { Node } from "../node";
import { Expression } from "./expression";

export class NumberLiteral<SrcT> extends Expression<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly value: bigint,
        public readonly radix: number
    ) {
        super(id, src);
    }

    pp(): string {
        return this.value.toString(this.radix);
    }

    getStructId(): any {
        return [this.radix, this.value];
    }

    children(): Iterable<Node<SrcT>> {
        return [];
    }
}
