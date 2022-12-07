import { Node } from "../node";
import { Type } from "./type";

export class ArrayType<SrcT> extends Type<SrcT> {
    constructor(id: number, src: SrcT, public readonly baseType: Type<SrcT>) {
        super(id, src);
    }

    pp(): string {
        return `${this.baseType.pp()}[]`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [this.baseType];
    }
}
