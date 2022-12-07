import { Node } from "../node";
import { Expression } from "./expression";

export class BooleanLiteral<SrcT> extends Expression<SrcT> {
    constructor(id: number, src: SrcT, public readonly value: boolean) {
        super(id, src);
    }

    pp(): string {
        return `${this.value}`;
    }

    getStructId(): any {
        return this.value;
    }

    children(): Iterable<Node<SrcT>> {
        return [];
    }
}
