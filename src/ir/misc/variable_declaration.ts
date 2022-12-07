import { Node } from "../node";
import { Type } from "../types";

export class VariableDeclaration<SrcT> extends Node<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly name: string,
        public readonly type: Type<SrcT>
    ) {
        super(id, src);
    }

    pp(): string {
        return `${this.name}: ${this.type.pp()}`;
    }

    getStructId(): any {
        return [this.name, this.type.getStructId()];
    }

    children(): Iterable<Node<SrcT>> {
        return [this.type];
    }
}
