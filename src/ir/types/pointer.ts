import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "./type";

export class PointerType extends Type {
    constructor(
        src: BaseSrc,
        public readonly toType: Type,
        public readonly region: string // TODO (@dimo): Pick better type for storing regions
    ) {
        super(src);
    }

    pp(): string {
        return `${this.toType.pp()} * ${this.region}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.toType];
    }
}
