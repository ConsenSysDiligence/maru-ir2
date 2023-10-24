import { TransformerFn, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { GlobalVarLiteral } from "./array_literal";

export class StructLiteral extends Node {
    constructor(
        src: BaseSrc,
        public readonly fields: Array<[string, GlobalVarLiteral]>
    ) {
        super(src);
    }

    pp(): string {
        return `{${this.fields.map(([name, v]) => `${name}: ${v.pp()}`).join(", ")}}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [...this.fields.map((x) => x[1])];
    }

    copy(t: TransformerFn | undefined): StructLiteral {
        return new StructLiteral(
            this.src,
            this.fields.map(([k, v]) => [k, transform(v, t)])
        );
    }

    field(needle: string): GlobalVarLiteral | undefined {
        for (const [name, lit] of this.fields) {
            if (needle === name) {
                return lit;
            }
        }

        return undefined;
    }
}
