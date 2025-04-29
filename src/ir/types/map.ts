import { TransformerFn, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class MapType extends Type {
    constructor(
        src: BaseSrc,
        public readonly keyType: Type,
        public readonly valueType: Type
    ) {
        super(src);
    }

    pp(): string {
        return `map(${this.keyType.pp()}, ${this.valueType.pp()})`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.keyType, this.valueType];
    }

    copy(t: TransformerFn | undefined): MapType {
        return new MapType(this.src, transform(this.keyType, t), transform(this.valueType, t));
    }
}
