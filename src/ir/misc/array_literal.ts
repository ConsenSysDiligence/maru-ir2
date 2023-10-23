import { TransformerF, transform } from "../copy";
import { BooleanLiteral, NumberLiteral } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { MapLiteral } from "./map_literal";
import { StructLiteral } from "./struct_literal";

export type GlobalVarLiteral =
    | NumberLiteral
    | BooleanLiteral
    | ArrayLiteral
    | StructLiteral
    | MapLiteral;

export class ArrayLiteral extends Node {
    constructor(
        src: BaseSrc,
        public readonly values: GlobalVarLiteral[]
    ) {
        super(src);
    }

    pp(): string {
        return `[${this.values.map((v) => v.pp()).join(", ")}]`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [...this.values];
    }

    copy(t: TransformerF | undefined): ArrayLiteral {
        return new ArrayLiteral(
            this.src,
            this.values.map((v) => transform(v, t))
        );
    }
}
