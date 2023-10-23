import { TransformerF, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class ArrayType extends Type {
    constructor(
        src: BaseSrc,
        public readonly baseType: Type
    ) {
        super(src);
    }

    pp(): string {
        return `${this.baseType.pp()}[]`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.baseType];
    }

    copy(t: TransformerF | undefined): ArrayType {
        return new ArrayType(this.src, transform(this.baseType, t));
    }
}
