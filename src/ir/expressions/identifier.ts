import { Expression } from "./expression";
import { Node } from "../node";

export class Identifier<SrcT> extends Expression<SrcT> {
    constructor(id: number, src: SrcT, public readonly name: string) {
        super(id, src);
    }

    pp(): string {
        return this.name;
    }

    getStructId(): any {
        return this.name;
    }

    children(): Iterable<Node<SrcT>> {
        return [];
    }
}
