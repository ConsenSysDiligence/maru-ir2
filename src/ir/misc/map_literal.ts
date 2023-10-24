import { TransformerFn, transform } from "../copy";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { GlobalVarLiteral } from "./array_literal";

export class MapLiteral extends Node {
    constructor(
        src: BaseSrc,
        public readonly values: Array<[GlobalVarLiteral, GlobalVarLiteral]>
    ) {
        super(src);
    }

    pp(): string {
        return `{${this.values.map(([k, v]) => `${k.pp()}:${v.pp()}`).join(", ")}}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        const res: Node[] = [];

        for (const [k, v] of this.values) {
            res.push(k, v);
        }

        return res;
    }

    copy(t: TransformerFn | undefined): MapLiteral {
        return new MapLiteral(
            this.src,
            this.values.map(([k, v]) => [transform(k, t), transform(v, t)])
        );
    }
}
