import { TransformerFn, transform } from "../copy";
import { MemConstant, MemIdentifier } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class PointerType extends Type {
    constructor(
        src: BaseSrc,
        public readonly toType: Type,
        public readonly region: MemIdentifier | MemConstant // TODO (@dimo): Pick better type for storing regions
    ) {
        super(src);
    }

    pp(): string {
        return `${this.toType.pp()} * ${this.region.pp()}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.toType, this.region];
    }

    copy(t: TransformerFn | undefined): PointerType {
        return new PointerType(this.src, transform(this.toType, t), transform(this.region, t));
    }
}
