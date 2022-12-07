import { Node } from "../node";
import { Type } from "./type";

export class PointerType<SrcT> extends Type<SrcT> {
    constructor(
        id: number,
        src: SrcT,
        public readonly toType: Type<SrcT>,
        public readonly region: string // TODO (@dimo): Pick better type for storing regions
    ) {
        super(id, src);
    }

    pp(): string {
        return `${this.toType.pp()} * ${this.region}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [this.toType];
    }
}
