import { TransformerFn, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { IntType } from "../types";
import { Expression } from "./expression";

export class NumberLiteral extends Expression {
    constructor(
        src: BaseSrc,
        public readonly value: bigint,
        public readonly radix: number,
        public readonly type: IntType
    ) {
        super(src);
    }

    pp(): string {
        let strVal = this.value.toString(this.radix);

        if (this.radix === 16) {
            strVal = strVal[0] === "-" ? "-0x" + strVal.slice(1) : "0x" + strVal;
        }

        return `${strVal}_${this.type.pp()}`;
    }

    getStructId(): any {
        return [this.type, this.radix, this.value];
    }

    children(): Iterable<Node> {
        return [];
    }

    copy(t: TransformerFn | undefined): NumberLiteral {
        return new NumberLiteral(this.src, this.value, this.radix, transform(this.type, t));
    }
}
